/// <reference types="node" />

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeScenario } from "../state/codec";
import { emptyScenario } from "../state/controller";
import worker from "../worker";
import { handlePosterRequest, MAX_POSTER_BODY_BYTES } from "./poster-http";
import { createSharedPoster, type PosterPublication } from "./poster-store";
import { png2023, png2027, posterAliasA, posterAliasB, posterInput, seedPriorPoster, SqlitePosters } from "./poster-test-support";

const origin = "https://rwc2027.myplaceforthings.com";
function post(value: unknown = posterInput(), headers: Record<string, string> = {}): Request {
  return new Request(`${origin}/api/posters`, {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(value),
  });
}

describe("Permanent poster HTTP routes", () => {
  let db: SqlitePosters;
  beforeEach(() => { db = new SqlitePosters(); });
  afterEach(() => { db.close(); vi.unstubAllGlobals(); });

  it("creates one artifact and returns permanent same-origin page and image paths without PNG in JSON", async () => {
    const response = await handlePosterRequest(post(), db);
    expect(response!.status).toBe(200);
    expect(response!.headers.get("Cache-Control")).toBe("no-store");
    const publication = await response!.json() as PosterPublication;
    expect(publication.token).toBe(posterInput().token);
    expect(publication.teamId).toBe("za");
    expect(publication.showPredictions).toBe(true);
    expect(publication.timeZone).toBe("Africa/Johannesburg");
    expect(publication.rendererVersion).toBe("pool-poster-v2");
    expect(publication.pageUrl).toBe(`/p/${publication.alias}`);
    expect(publication.imageUrl).toBe(`/i/${publication.alias}.png`);
    expect(publication).not.toHaveProperty("png");
    expect(await (await handlePosterRequest(post(), db))!.json()).toEqual(publication);
    expect(db.count()).toBe(1);
  });

  it("serves exact PNG bytes with immutable caching, ETag, filename, HEAD and conditional requests", async () => {
    const poster = await createSharedPoster(db, posterInput(), () => posterAliasA);
    const url = `${origin}${poster.imageUrl}`;
    for (const method of ["GET", "HEAD"]) {
      const response = (await handlePosterRequest(new Request(url, { method }), db))!;
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("image/png");
      expect(response.headers.get("Content-Length")).toBe(String(Buffer.from(png2027, "base64").byteLength));
      expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.get("Content-Disposition")).toBe('inline; filename="rwc-2027-za-pool.png"');
      expect(response.headers.get("ETag")).toBe(`"${poster.pngHash}"`);
      if (method === "GET") expect(new Uint8Array(await response.arrayBuffer())).toEqual(poster.png);
      else expect(response.body).toBeNull();
    }
    for (const value of [`"${poster.pngHash}"`, `W/"${poster.pngHash}"`, "*", `"other", "${poster.pngHash}"`]) {
      const response = (await handlePosterRequest(new Request(url, { headers: { "If-None-Match": value } }), db))!;
      expect(response.status).toBe(304);
      expect(response.body).toBeNull();
    }
    expect((await handlePosterRequest(new Request(url, { headers: { "If-None-Match": '"other"' } }), db))!.status).toBe(200);
  });

  it("serves crawler metadata and a visible no-JS CTA which reproduces the exact snapshot and focus", async () => {
    const poster = await createSharedPoster(db, posterInput(), () => posterAliasA);
    const response = (await handlePosterRequest(new Request(`${origin}${poster.pageUrl}`, { headers: { "User-Agent": "facebookexternalhit/1.1" } }), db))!;
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toMatch(/text\/html/);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
    expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    expect(html).toContain("South Africa pool predictions | Men’s Rugby World Cup 2027");
    expect(html).toContain(`<meta property="og:image" content="${origin}${poster.imageUrl}">`);
    expect(html).toContain(`<meta property="og:url" content="${origin}${poster.pageUrl}">`);
    expect(html).toContain('<meta property="og:image:width" content="1080">');
    expect(html).toContain('<meta property="og:image:height" content="1808">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain(`<meta name="twitter:image" content="${origin}${poster.imageUrl}">`);
    expect(html).toContain(`<img src="${poster.imageUrl}" width="1080" height="1808"`);
    expect(html).toContain(`href="/?focus=za#predictions=${poster.token}">Make your predictions</a>`);
    expect(html).toContain(`href="${poster.imageUrl}" download="rwc-2027-za-pool.png">Download PNG</a>`);
    expect(html).toContain("South Africa vs Italy.");
    expect(html).toContain("Adelaide Oval, Adelaide.");
    expect(html).toContain("Brisbane Stadium, Brisbane.");
    expect(html).toContain("Perth Stadium, Perth.");
    expect(html).toContain("Kickoff times in Africa/Johannesburg.");
    expect(html).toContain("Open the predictor to read or edit the saved predictions.");
    expect(html).not.toContain("<script");
    const head = (await handlePosterRequest(new Request(`${origin}${poster.pageUrl}`, { method: "HEAD" }), db))!;
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
  });

  it("publishes fixtures wording and empty same-tournament links when predictions are hidden", async () => {
    const response = (await handlePosterRequest(post(posterInput({ showPredictions: false })), db))!;
    const publication = await response.json() as PosterPublication;
    expect(publication.token).toBe(encodeScenario(emptyScenario()));
    expect(publication.token).not.toBe(posterInput().token);
    const html = await (await handlePosterRequest(new Request(`${origin}${publication.pageUrl}`), db))!.text();
    expect(html).toContain("South Africa pool fixtures");
    expect(html).toContain(`href="/?focus=za#predictions=${encodeScenario(emptyScenario())}">Make your predictions</a>`);
    expect(html).not.toContain(posterInput().token);
    const legacy = (await handlePosterRequest(post(posterInput({
      token: encodeScenario(emptyScenario("rwc2023")), png: png2023, showPredictions: false,
    })), db))!;
    const legacyPublication = await legacy.json() as PosterPublication;
    const legacyHtml = await (await handlePosterRequest(new Request(`${origin}${legacyPublication.pageUrl}`), db))!.text();
    expect(legacyHtml).toContain("Rugby World Cup 2023");
    expect(legacyHtml).toContain('content="2216"');
    expect(legacyHtml).toContain(`href="/?focus=za#predictions=${encodeScenario(emptyScenario("rwc2023"))}"`);
    expect(legacyHtml).toContain(`href="/?focus=za#predictions=${encodeScenario(emptyScenario("rwc2023"))}">Start fresh</a>`);
  });

  it("labels untouched or other-team-only snapshots as fixtures even when Show predictions is on", async () => {
    for (const otherTeamPicked of [false, true]) {
      const scenario = emptyScenario();
      if (otherTeamPicked) scenario.predictions[1] = { intent: { winner: "home" } };
      const publication = await (await handlePosterRequest(post(posterInput({ token: encodeScenario(scenario) })), db))!.json() as PosterPublication;
      expect(publication.showPredictions).toBe(true);
      const html = await (await handlePosterRequest(new Request(`${origin}${publication.pageUrl}`), db))!.text();
      expect(html).toContain("South Africa pool fixtures | Men’s Rugby World Cup 2027");
      expect(html).not.toContain("South Africa pool predictions");
      expect(html).toContain("<p>Pick the winners and explore the tournament.</p>");
      expect(html).toContain(`href="/?focus=za#predictions=${encodeScenario(scenario)}">Make your predictions</a>`);
    }
  });

  it("serves previously saved image sizes and reports their original dimensions to crawlers", async () => {
    for (const [tournamentId, alias] of [["rwc2027", posterAliasA], ["rwc2023", posterAliasB]] as const) {
      const prior = seedPriorPoster(db, tournamentId, alias);
      const image = (await handlePosterRequest(new Request(`${origin}/i/${alias}.png`), db))!;
      expect(image.status).toBe(200);
      expect(new Uint8Array(await image.arrayBuffer())).toEqual(new Uint8Array(Buffer.from(prior.png, "base64")));
      const html = await (await handlePosterRequest(new Request(`${origin}/p/${alias}`), db))!.text();
      expect(html).toContain(`<meta property="og:image:height" content="${prior.height}">`);
      expect(html).toContain(`<img src="/i/${alias}.png" width="1080" height="${prior.height}"`);
    }
  });

  it("uses the preview request origin for crawler links and ignores caller-supplied forwarding headers", async () => {
    const saved = await createSharedPoster(db, posterInput(), () => posterAliasA);
    const previewOrigin = "http://127.0.0.1:8787";
    const response = (await handlePosterRequest(new Request(`${previewOrigin}${saved.pageUrl}`, {
      headers: {
        Host: "elsewhere.example", "X-Forwarded-Host": "elsewhere.example", "X-Forwarded-Proto": "https",
        Forwarded: 'host="elsewhere.example";proto=https', "MF-Original-URL": `https://elsewhere.example${saved.pageUrl}`,
      },
    }), db))!;
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain(`<meta property="og:image" content="${previewOrigin}${saved.imageUrl}">`);
    expect(html).toContain(`<meta property="og:url" content="${previewOrigin}${saved.pageUrl}">`);
    expect(html).toContain(`<meta name="twitter:image" content="${previewOrigin}${saved.imageUrl}">`);
    expect(html).toContain(`<link rel="canonical" href="${previewOrigin}${saved.pageUrl}">`);
    expect(html).not.toContain("elsewhere.example");
  });

  it("bounds declared and actual streamed bytes, validates MIME, JSON fields and malformed UTF-8", async () => {
    for (const value of ["-1", "invalid", String(MAX_POSTER_BODY_BYTES + 1)]) {
      expect((await handlePosterRequest(post({}, { "Content-Length": value }), db))!.status).toBe(413);
    }
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(MAX_POSTER_BODY_BYTES)); controller.enqueue(new Uint8Array(1)); controller.close(); },
    });
    const streamed = new Request(`${origin}/api/posters`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: stream, duplex: "half",
    } as RequestInit);
    expect((await handlePosterRequest(streamed, db))!.status).toBe(413);
    expect((await handlePosterRequest(post({}, { "Content-Type": "text/plain" }), db))!.status).toBe(415);
    for (const value of [{}, [], { ...posterInput(), extra: "bad" }, posterInput({ png: "not a PNG" }), posterInput({ token: "v99.bad" })]) {
      expect((await handlePosterRequest(post(value), db))!.status).toBe(400);
    }
    for (const body of ["{", new Uint8Array([0xff])]) {
      const request = new Request(`${origin}/api/posters`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      expect((await handlePosterRequest(request, db))!.status).toBe(400);
    }
    expect(db.count()).toBe(0);
  });

  it("rejects cross-origin uploads and unsupported methods without creating rows", async () => {
    expect((await handlePosterRequest(post(posterInput(), { Origin: "https://elsewhere.example" }), db))!.status).toBe(403);
    for (const path of ["/api/posters", `/i/${posterAliasA}.png`, `/p/${posterAliasA}`]) {
      const response = (await handlePosterRequest(new Request(`${origin}${path}`, { method: "DELETE" }), db))!;
      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe(path === "/api/posters" ? "POST" : "GET, HEAD");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
    expect((await handlePosterRequest(new Request(`${origin}/api/posters`), db))!.status).toBe(405);
    expect(db.count()).toBe(0);
    expect((await handlePosterRequest(post(posterInput(), { Origin: origin }), db))!.status).toBe(200);
  });

  it("limits only creation by client IP and handles unavailable storage without leaking details", async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const denied = (await handlePosterRequest(post(posterInput(), { "CF-Connecting-IP": "192.0.2.1" }), db, { limit }))!;
    expect(denied.status).toBe(429);
    expect(denied.headers.get("Retry-After")).toBe("60");
    expect(limit).toHaveBeenCalledWith({ key: "create-poster:192.0.2.1" });
    await handlePosterRequest(new Request(`${origin}/i/${posterAliasA}.png`), db, { limit });
    await handlePosterRequest(new Request(`${origin}/p/${posterAliasA}`, { method: "HEAD" }), db, { limit });
    expect(limit).toHaveBeenCalledTimes(1);
    expect(db.count()).toBe(0);
    const unavailable = (await handlePosterRequest(post()))!;
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("Cache-Control")).toBe("no-store");
    const broken = { prepare() { throw new Error("Private D1 details"); } };
    const failure = (await handlePosterRequest(post(), broken))!;
    expect(failure.status).toBe(503);
    expect(await failure.text()).not.toContain("Private D1 details");
    const brokenLimiter = { limit: async () => { throw new Error("Private rate-limit details"); } };
    expect((await handlePosterRequest(post(), db, brokenLimiter))!.status).toBe(503);
  });

  it("returns uncached missing or invalid artifacts and never turns aliases into redirects", async () => {
    for (const path of [`/p/${posterAliasA}`, "/p/other.other.other", `/p/${posterAliasA}/extra`, `/i/${posterAliasA}.png`, `/i/${posterAliasA}`, "/i/https://evil.example.png"]) {
      for (const method of ["GET", "HEAD"]) {
        const response = (await handlePosterRequest(new Request(`${origin}${path}`, { method }), db))!;
        expect(response.status).toBe(404);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(response.headers.has("Location")).toBe(false);
        if (method === "HEAD") expect(response.body).toBeNull();
      }
    }
    expect(await handlePosterRequest(new Request(`${origin}/social/rwc2027-card-v1.png`), db)).toBeUndefined();
  });

  it("handles permanent artifacts before legacy document rewrites while retaining old static and sharing routes", async () => {
    const assets = { fetch: vi.fn(async (request: Request) => new Response(new URL(request.url).pathname)) };
    const created = await worker.fetch(post(), { ASSETS: assets, SHARES: db });
    const publication = await created.json() as PosterPublication;
    expect(created.status).toBe(200);
    const page = await worker.fetch(new Request(`${origin}${publication.pageUrl}`, { headers: { Accept: "text/html" } }), { ASSETS: assets, SHARES: db });
    expect(await page.text()).toContain("Make your predictions");
    expect(assets.fetch).not.toHaveBeenCalled();
    const old = await worker.fetch(new Request(`${origin}/AQE/fixed/slashes`, { headers: { Accept: "text/html" } }), { ASSETS: assets });
    expect(await old.text()).toBe("/");
    expect(await (await worker.fetch(new Request(`${origin}/social/rwc2027-card-v1.png`), { ASSETS: assets })).text()).toBe("/social/rwc2027-card-v1.png");
  });

  it("serves cached artifacts without D1 and caches only successful GETs through waitUntil", async () => {
    const entries = new Map<string, Response>();
    const match = vi.fn(async (request: Request) => entries.get(request.url)?.clone());
    const put = vi.fn(async (request: Request, response: Response) => { entries.set(request.url, response.clone()); });
    vi.stubGlobal("caches", { default: { match, put } });
    const pending: Promise<unknown>[] = [];
    const context = { waitUntil(promise: Promise<unknown>) { pending.push(promise); } };
    const assets = { fetch: vi.fn(async () => new Response("assets")) };
    const publication = await (await worker.fetch(post(), { ASSETS: assets, SHARES: db }, context)).json() as PosterPublication;
    expect(put).not.toHaveBeenCalled();
    for (const path of [publication.pageUrl, publication.imageUrl]) {
      const first = await worker.fetch(new Request(`${origin}${path}?utm_source=friend`), { ASSETS: assets, SHARES: db }, context);
      expect(first.status).toBe(200);
      await Promise.all(pending);
      const cached = await worker.fetch(new Request(`${origin}${path}`), { ASSETS: assets }, context);
      expect(cached.status).toBe(200);
      const head = await worker.fetch(new Request(`${origin}${path}`, { method: "HEAD" }), { ASSETS: assets }, context);
      expect(head.status).toBe(200);
      expect(head.body).toBeNull();
      expect(await cached.arrayBuffer()).toEqual(await first.arrayBuffer());
    }
    expect(put).toHaveBeenCalledTimes(2);
    const image = entries.get(`${origin}${publication.imageUrl}`)!;
    const conditional = await worker.fetch(new Request(`${origin}${publication.imageUrl}`, { headers: { "If-None-Match": image.headers.get("ETag")! } }), { ASSETS: assets }, context);
    expect(conditional.status).toBe(304);
    await worker.fetch(new Request(`${origin}/i/${posterAliasA}.png`), { ASSETS: assets, SHARES: db }, context);
    expect(put).toHaveBeenCalledTimes(2);
    expect(assets.fetch).not.toHaveBeenCalled();
  });

  it("falls back to D1 if the edge cache cannot be read or written", async () => {
    vi.stubGlobal("caches", {
      default: {
        match: async () => { throw new Error("Cache unavailable"); },
        put: async () => { throw new Error("Cache unavailable"); },
      },
    });
    const saved = await createSharedPoster(db, posterInput(), () => posterAliasA);
    const assets = { fetch: async () => new Response("assets") };
    const result = await worker.fetch(new Request(`${origin}${saved.imageUrl}`), { ASSETS: assets, SHARES: db });
    expect(result.status).toBe(200);
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(saved.png);
  });
});
