import type { Scenario } from "../domain/types";
import { encodeScenario } from "../state/codec";

export const SHARE_TIMEOUT_MS = 5000;

export interface ShareSnapshot {
  readonly token: string;
  readonly fullUrl: string;
  readonly empty: boolean;
}

export interface ShareLink {
  url: string;
  shortUnavailable: boolean;
}

interface ShareClientOptions {
  fetch?: typeof fetch;
  isOnline?: () => boolean;
  timeoutMs?: number;
}

/** Capture immutable strings before any network or clipboard work starts. */
export function captureShareSnapshot(scenario: Scenario, href: string, basePath = "/"): ShareSnapshot {
  const token = encodeScenario(scenario);
  const empty = scenario.tournamentId === "rwc2027" && !Object.keys(scenario.predictions).length;
  const url = new URL(basePath, href);
  url.search = new URL(href).search;
  if (!empty) {
    url.hash = `predictions=${token}`;
  }
  return Object.freeze({ token, fullUrl: url.href, empty });
}

/** Optional sharing service: editing and the canonical prediction URL stay local. */
export function createShareClient(options: ShareClientOptions = {}) {
  const request = options.fetch ?? globalThis.fetch.bind(globalThis);
  const isOnline = options.isOnline ?? (() => typeof navigator === "undefined" || navigator.onLine !== false);
  const timeoutMs = options.timeoutMs ?? SHARE_TIMEOUT_MS;
  const aliases = new Map<string, string>();
  const lookups = new Map<string, Promise<string | undefined>>();

  function shortLink(snapshot: ShareSnapshot, alias: string): ShareLink {
    const url = new URL(`/s/${alias}`, snapshot.fullUrl);
    url.search = new URL(snapshot.fullUrl).search;
    return { url: url.href, shortUnavailable: false };
  }

  function cachedLink(snapshot: ShareSnapshot): ShareLink | undefined {
    const alias = aliases.get(snapshot.token);
    return alias ? shortLink(snapshot, alias) : undefined;
  }

  function responseAlias(value: unknown, token: string): string {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid short link response.");
    const { alias, token: savedToken } = value as Record<string, unknown>;
    if (savedToken !== token || typeof alias !== "string" || alias.length >= 64 ||
      /^[a-z]+(?:\.[a-z]+){2}$/.exec(alias)?.[0] !== alias) {
      throw new Error("Short link response does not match the shared predictions.");
    }
    return alias;
  }

  async function requestAlias(token: string, method: "GET" | "POST", signal?: AbortSignal): Promise<string> {
    if (signal?.aborted) throw new Error("Short link request cancelled.");
    const abort = new AbortController();
    let rejectInterrupted!: (reason: Error) => void;
    const interrupted = new Promise<never>((_, reject) => { rejectInterrupted = reject; });
    const cancel = () => { abort.abort(); rejectInterrupted(new Error("Short link request interrupted.")); };
    const timer = setTimeout(cancel, timeoutMs);
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      return await Promise.race([
        (async () => {
          let url = "/api/shares";
          if (method === "GET") {
            const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
            const fingerprint = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
            url += `?fingerprint=${fingerprint}`;
          }
          abort.signal.throwIfAborted();
          const response = await request(url, {
            method,
            ...(method === "POST" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) } : { cache: "no-store" }),
            signal: abort.signal,
          });
          if (!response.ok) throw new Error("Short link service unavailable.");
          const value: unknown = await response.json();
          abort.signal.throwIfAborted();
          return responseAlias(value, token);
        })(),
        interrupted,
      ]);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }
  }

  async function lookup(token: string, signal?: AbortSignal): Promise<string | undefined> {
    try {
      const alias = await requestAlias(token, "GET", signal);
      if (signal?.aborted) return undefined;
      aliases.set(token, alias);
      return alias;
    } catch {
      return undefined;
    }
  }

  return {
    cachedLink,
    /** Read an existing immutable snapshot; never create one during prediction edits. */
    async findExistingLink(snapshot: ShareSnapshot, signal?: AbortSignal): Promise<ShareLink | undefined> {
      if (snapshot.empty || signal?.aborted) return undefined;
      const cached = cachedLink(snapshot);
      if (cached) return cached;
      try { if (!isOnline()) return undefined; } catch { return undefined; }
      if (signal) {
        const alias = await lookup(snapshot.token, signal);
        return alias ? shortLink(snapshot, alias) : undefined;
      }
      let pending = lookups.get(snapshot.token);
      if (!pending) {
        pending = lookup(snapshot.token).finally(() => lookups.delete(snapshot.token));
        lookups.set(snapshot.token, pending);
      }
      const alias = await pending;
      return alias ? shortLink(snapshot, alias) : undefined;
    },
    async getLink(snapshot: ShareSnapshot): Promise<ShareLink> {
      if (snapshot.empty) return { url: snapshot.fullUrl, shortUnavailable: false };
      const cached = cachedLink(snapshot);
      if (cached) return cached;
      try {
        if (!isOnline()) throw new Error("Offline.");
        const alias = await requestAlias(snapshot.token, "POST");
        aliases.set(snapshot.token, alias);
        return shortLink(snapshot, alias);
      } catch {
        return { url: snapshot.fullUrl, shortUnavailable: true };
      }
    },
  };
}
