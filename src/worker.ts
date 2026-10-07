import { handleShareRequest, type ShareLimiter } from "./sharing/http";
import type { SharingDatabase } from "./sharing/store";
import { handlePosterRequest } from "./sharing/poster-http";

interface Environment {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  SHARES?: SharingDatabase;
  SHARE_LIMITER?: ShareLimiter;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

function cachedPosterResponse(response: Response, request: Request): Response {
  const etag = response.headers.get("ETag");
  if (etag && request.headers.get("If-None-Match")?.split(",").some((value) => value.trim() === etag || value.trim() === "*" || value.trim() === `W/${etag}`)) {
    return new Response(null, { status: 304, headers: response.headers });
  }
  return request.method === "HEAD" ? new Response(null, { status: response.status, headers: response.headers }) : response;
}

export default {
  async fetch(request: Request, env: Environment, context?: ExecutionContext): Promise<Response> {
    const posterUrl = new URL(request.url);
    const posterRead = (request.method === "GET" || request.method === "HEAD")
      && (posterUrl.pathname.startsWith("/i/") || posterUrl.pathname.startsWith("/p/"));
    const cache = posterRead ? (globalThis.caches as CacheStorage & { default?: Cache } | undefined)?.default : undefined;
    posterUrl.search = "";
    const cacheKey = posterRead ? new Request(posterUrl, { method: "GET" }) : undefined;
    if (cache && cacheKey) {
      try {
        const saved = await cache.match(cacheKey);
        if (saved) return cachedPosterResponse(saved, request);
      } catch { /* Cache failures fall through to the permanent database. */ }
    }
    const poster = await handlePosterRequest(request, env.SHARES, env.SHARE_LIMITER);
    if (poster) {
      if (cache && cacheKey && request.method === "GET" && poster.status === 200) {
        const write = cache.put(cacheKey, poster.clone()).catch(() => undefined);
        if (context) context.waitUntil(write);
        else await write;
      }
      return poster;
    }
    const share = await handleShareRequest(request, env.SHARES, env.SHARE_LIMITER);
    if (share) return share;
    // Root and common static paths bypass this Worker. Rewrite documents before
    // the asset service can normalize slashes inside a legacy Base64 prediction.
    const url = new URL(request.url);
    const document = request.headers.get("Sec-Fetch-Mode") === "navigate"
      || request.headers.get("Accept")?.includes("text/html")
      || url.pathname === "/index.html";
    if ((request.method === "GET" || request.method === "HEAD") && document) {
      // With automatic HTML handling, '/' serves index.html without a redirect.
      url.pathname = "/";
      return env.ASSETS.fetch(new Request(url, request));
    }
    return env.ASSETS.fetch(request);
  },
};
