import { handleShareRequest, type ShareLimiter } from "./sharing/http";
import type { SharingDatabase } from "./sharing/store";

interface Environment {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  SHARES?: SharingDatabase;
  SHARE_LIMITER?: ShareLimiter;
}

export default {
  async fetch(request: Request, env: Environment): Promise<Response> {
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
