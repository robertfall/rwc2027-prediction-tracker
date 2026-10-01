import { createSharedSnapshot, isShareFingerprint, readSharedSnapshot, readSharedSnapshotByFingerprint, ShareInputError, type SharingDatabase } from "./store";

export const MAX_SHARE_BODY_BYTES = 16_384;
export interface ShareLimiter {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}
const noCache = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const snapshotCache = { "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" };

function json(value: unknown, status = 200, headers: HeadersInit = noCache, head = false): Response {
  return new Response(head ? null : JSON.stringify(value), {
    status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}

function error(message: string, status: number, head: boolean, extra: Record<string, string> = {}): Response {
  return json({ error: message }, status, { ...noCache, ...extra }, head);
}

async function readToken(request: Request): Promise<unknown> {
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new ShareInputError("Send a JSON prediction token.", 415);
  }
  const length = request.headers.get("Content-Length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_SHARE_BODY_BYTES)) {
    throw new ShareInputError("That prediction link is too large.", 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ShareInputError("Provide one valid prediction token.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SHARE_BODY_BYTES) {
        await reader.cancel();
        throw new ShareInputError("That prediction link is too large.", 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let position = 0;
    for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.byteLength; }
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).length !== 1 || !Object.hasOwn(value, "token")) throw new Error("Invalid fields");
    return (value as { token: unknown }).token;
  } catch (cause) {
    if (cause instanceof ShareInputError) throw cause;
    throw new ShareInputError("Provide one valid prediction token.");
  } finally {
    reader.releaseLock();
  }
}

function missingSnapshot(head: boolean): Response {
  const body = "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Prediction link not found | RWC 2027 Predictor</title><body><main><h1>Prediction link not found</h1><p>Check the link, or <a href=\"/\">start a new prediction</a>.</p></main></body></html>";
  return new Response(head ? null : body, { status: 404, headers: { ...noCache, "Content-Type": "text/html; charset=utf-8" } });
}

/** Return undefined for every existing asset/legacy route. */
export async function handleShareRequest(request: Request, db?: SharingDatabase, limiter?: ShareLimiter): Promise<Response | undefined> {
  const url = new URL(request.url);
  const path = url.pathname;
  const collection = path === "/api/shares";
  const create = collection && request.method === "POST";
  const apiLookup = path.startsWith("/api/shares/");
  const documentLookup = path.startsWith("/s/");
  if (!collection && !apiLookup && !documentLookup) return undefined;
  const head = request.method === "HEAD";
  if (!create && request.method !== "GET" && !head) {
    return error("This method is not supported.", 405, head, { Allow: collection ? "GET, HEAD, POST" : "GET, HEAD" });
  }
  if (create && request.headers.has("Origin") && request.headers.get("Origin") !== url.origin) {
    return error("Share predictions from this site.", 403, head);
  }
  let hash: string | undefined;
  if (collection && !create) {
    const parameters = [...url.searchParams];
    if (parameters.length !== 1 || parameters[0][0] !== "fingerprint" || !isShareFingerprint(parameters[0][1])) {
      return error("Provide one valid snapshot fingerprint.", 400, head);
    }
    hash = parameters[0][1];
  }
  if (!db) return error("Short sharing is unavailable. Use the full prediction link.", 503, head);
  try {
    if (create) {
      if (limiter) {
        const ip = request.headers.get("CF-Connecting-IP") || "local";
        const permitted = await limiter.limit({ key: `create-share:${ip}` });
        if (!permitted.success) return error("Please wait a moment before sharing again.", 429, head, { "Retry-After": "60" });
      }
      return json(await createSharedSnapshot(db, await readToken(request)));
    }
    if (collection) {
      const snapshot = await readSharedSnapshotByFingerprint(db, hash);
      return snapshot ? json(snapshot, 200, snapshotCache, head) : error("Prediction link not found.", 404, head);
    }
    const alias = path.slice(apiLookup ? "/api/shares/".length : "/s/".length);
    const snapshot = await readSharedSnapshot(db, alias);
    if (!snapshot) return apiLookup ? error("Prediction link not found.", 404, head) : missingSnapshot(head);
    if (apiLookup) return json(snapshot, 200, snapshotCache, head);
    // Parsed search stays query data; the relative path and canonical token fix the origin and fragment.
    return new Response(null, { status: 302, headers: { ...snapshotCache, Location: `/${url.search}#predictions=${snapshot.token}` } });
  } catch (cause) {
    if (cause instanceof ShareInputError) return error(cause.message, cause.status, head);
    return error("Short sharing is unavailable. Use the full prediction link.", 503, head);
  }
}
