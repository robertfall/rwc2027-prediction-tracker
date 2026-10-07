import type { Scenario } from "../domain/types";
import { encodeScenario } from "../state/codec";
import { emptyScenario } from "../state/controller";
import { isShareAlias } from "./words";
import { SHARE_TIMEOUT_MS } from "./client";

export const POOL_POSTER_RENDERER_VERSION = "pool-poster-v2";
const MAX_PNG_BYTES = 512 * 1024;

export interface PosterSnapshot {
  readonly token: string;
  readonly teamId: string;
  readonly timeZone: string;
  readonly showPredictions: boolean;
  readonly rendererVersion: typeof POOL_POSTER_RENDERER_VERSION;
  readonly fallbackUrl: string;
}

export interface PosterLink {
  url: string;
  imageUrl?: string;
  unavailable: boolean;
}

/** Hidden predictions never enter the upload or its fallback destination. */
export function capturePosterSnapshot(scenario: Scenario, teamId: string, timeZone: string, showPredictions: boolean, href: string): PosterSnapshot {
  const token = encodeScenario(showPredictions ? scenario : emptyScenario(scenario.tournamentId));
  const destination = new URL(import.meta.env.BASE_URL, href);
  destination.searchParams.set("focus", teamId);
  destination.hash = `predictions=${token}`;
  return Object.freeze({ token, teamId, timeZone, showPredictions, rendererVersion: POOL_POSTER_RENDERER_VERSION, fallbackUrl: destination.href });
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}

export function createPosterClient(options: { fetch?: typeof fetch; isOnline?: () => boolean; timeoutMs?: number } = {}) {
  const request = options.fetch ?? globalThis.fetch.bind(globalThis);
  const isOnline = options.isOnline ?? (() => typeof navigator === "undefined" || navigator.onLine !== false);
  // Blob identity retains successful uploads and coalesces clicks without retaining image bytes globally.
  const published = new WeakMap<Blob, Map<string, Promise<PosterLink>>>();

  async function publish(snapshot: PosterSnapshot, png: Blob): Promise<PosterLink> {
    const fallback = { url: snapshot.fallbackUrl, unavailable: true };
    const abort = new AbortController();
    let rejectTimeout!: (reason: Error) => void;
    const interrupted = new Promise<never>((_, reject) => { rejectTimeout = reject; });
    const timer = setTimeout(() => { abort.abort(); rejectTimeout(new Error("Image sharing timed out.")); }, options.timeoutMs ?? SHARE_TIMEOUT_MS);
    try {
      return await Promise.race([
        (async () => {
          if (!isOnline() || png.type !== "image/png" || png.size === 0 || png.size > MAX_PNG_BYTES) throw new Error("Image sharing is unavailable.");
          const bytes = new Uint8Array(await png.arrayBuffer());
          abort.signal.throwIfAborted();
          const metadata = { token: snapshot.token, teamId: snapshot.teamId, timeZone: snapshot.timeZone,
            showPredictions: snapshot.showPredictions, rendererVersion: snapshot.rendererVersion };
          const response = await request("/api/posters", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...metadata, png: base64(bytes) }), signal: abort.signal });
          if (!response.ok) throw new Error("Image sharing is unavailable.");
          const value: unknown = await response.json();
          abort.signal.throwIfAborted();
          if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid image link.");
          const saved = value as Record<string, unknown>;
          if (!isShareAlias(saved.alias) || Object.entries(metadata).some(([key, expected]) => saved[key] !== expected)
            || saved.pageUrl !== `/p/${saved.alias}` || saved.imageUrl !== `/i/${saved.alias}.png`) throw new Error("Image link does not match this poster.");
          return { url: new URL(saved.pageUrl as string, snapshot.fallbackUrl).href,
            imageUrl: new URL(saved.imageUrl as string, snapshot.fallbackUrl).href, unavailable: false };
        })(), interrupted,
      ]);
    } catch { return fallback; }
    finally { clearTimeout(timer); }
  }

  return {
    getLink(snapshot: PosterSnapshot, png?: Blob): Promise<PosterLink> {
      if (!png) return Promise.resolve({ url: snapshot.fallbackUrl, unavailable: true });
      let variants = published.get(png);
      if (!variants) { variants = new Map(); published.set(png, variants); }
      const key = JSON.stringify(snapshot);
      const existing = variants.get(key);
      if (existing) return existing;
      const pending = publish(snapshot, png).then((link) => {
        if (link.unavailable) variants!.delete(key);
        return link;
      });
      variants.set(key, pending);
      return pending;
    },
  };
}
