import { getTournament } from "../domain/tournaments";
import { decodeScenario, encodeScenario } from "../state/codec";
import type { ShareLimiter } from "./http";
import { createSharedPoster, posterPublication, readSharedPoster, type SharedPoster } from "./poster-store";
import { ShareInputError, type SharingDatabase } from "./store";

export const MAX_POSTER_BODY_BYTES = 750 * 1024;
const noCache = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const imageCache = { "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" };
const pageCache = { "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" };

function json(value: unknown, status: number, head = false, extra: Record<string, string> = {}): Response {
  return new Response(head ? null : JSON.stringify(value), {
    status, headers: { ...noCache, ...extra, "Content-Type": "application/json; charset=utf-8" },
  });
}

async function readPoster(request: Request): Promise<unknown> {
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new ShareInputError("Send a JSON pool poster.", 415);
  }
  const length = request.headers.get("Content-Length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_POSTER_BODY_BYTES)) {
    throw new ShareInputError("That poster image is too large.", 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ShareInputError("Provide one valid pool poster.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_POSTER_BODY_BYTES) {
        await reader.cancel();
        throw new ShareInputError("That poster image is too large.", 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch (cause) {
    if (cause instanceof ShareInputError) throw cause;
    throw new ShareInputError("Provide one valid pool poster.");
  } finally { reader.releaseLock(); }
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function posterDocument(poster: SharedPoster, origin: string): string {
  const scenario = decodeScenario(poster.token);
  const tournament = getTournament(scenario.tournamentId);
  const team = tournament.teams.find((candidate) => candidate.id === poster.teamId)!;
  const fixtures = tournament.fixtures.filter((fixture) => fixture.stage === "pool"
    && [fixture.home, fixture.away].some((source) => source.kind === "team" && source.teamId === poster.teamId))
    .sort((first, second) => first.kickoff.localeCompare(second.kickoff));
  const hasPredictions = poster.showPredictions && fixtures.some((fixture) =>
    Object.keys(scenario.predictions[fixture.id]?.intent ?? {}).length > 0 || scenario.resolved?.[fixture.id] !== undefined);
  const subject = hasPredictions ? "pool predictions" : "pool fixtures";
  const title = `${team.name} ${subject} | ${tournament.name}`;
  const description = hasPredictions
    ? `Explore these ${team.name} predictions and make your own ${tournament.name} predictions.`
    : `See ${team.name}'s pool fixtures, then make your own ${tournament.name} predictions.`;
  const introduction = hasPredictions ? "Open these picks, then make your predictions." : "Pick the winners and explore the tournament.";
  const image = new URL(poster.imageUrl, origin).href;
  const page = new URL(poster.pageUrl, origin).href;
  const predictionLink = `/?focus=${encodeURIComponent(poster.teamId)}#predictions=${poster.token}`;
  const freshLink = `/?focus=${encodeURIComponent(poster.teamId)}#predictions=${encodeScenario({ ...scenario, predictions: {}, resolved: {} })}`;
  const teams = new Map(tournament.teams.map((candidate) => [candidate.id, candidate.name]));
  const kickoff = new Intl.DateTimeFormat("en-GB", { timeZone: poster.timeZone, dateStyle: "full", timeStyle: "short" });
  const fixtureList = fixtures.map((fixture) => {
      const home = fixture.home.kind === "team" ? teams.get(fixture.home.teamId)! : "Unresolved team";
      const away = fixture.away.kind === "team" ? teams.get(fixture.away.teamId)! : "Unresolved team";
      return `<li>${escapeHtml(`${home} vs ${away}. ${kickoff.format(new Date(fixture.kickoff))}. ${fixture.venue}.`)}</li>`;
    }).join("");
  const accessibleNote = hasPredictions
    ? "Open the predictor to read or edit the saved predictions."
    : "Open the predictor to make your predictions.";
  const year = tournament.id === "rwc2027" ? "2027" : "2023";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(page)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="RWC Predictor"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(page)}"><meta property="og:image" content="${escapeHtml(image)}"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="${poster.width}"><meta property="og:image:height" content="${poster.height}"><meta property="og:image:alt" content="${escapeHtml(title)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${escapeHtml(image)}"><meta name="twitter:image:alt" content="${escapeHtml(title)}">
<style>*{box-sizing:border-box}body{margin:0;background:#f7f3e8;color:#202a27;font-family:system-ui,sans-serif}main{max-width:640px;margin:auto;padding:28px 20px 40px}header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:24px}.brand{font-size:13px;letter-spacing:.12em;font-weight:750}.cta{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:12px 18px;border-radius:8px;background:#245c4a;color:#fff;text-decoration:none;font-weight:650}h1{font-size:clamp(24px,5vw,34px);line-height:1.15;margin:0 0 12px}p{line-height:1.5;margin:0 0 24px;color:#65706b}img{display:block;width:100%;height:auto;border-radius:12px;box-shadow:0 8px 32px #202a2715}footer{margin-top:24px;display:flex;align-items:center;gap:20px;flex-wrap:wrap}footer>a:not(.cta){color:#245c4a}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:420px){header{align-items:flex-start;flex-direction:column}.cta{width:100%}main{padding-inline:16px}}</style></head>
<body><main><header><span class="brand">RWC ${year} PREDICTOR</span><a class="cta" href="${escapeHtml(predictionLink)}">Make your predictions</a></header><h1>${escapeHtml(team.name)} ${subject}</h1><p>${escapeHtml(introduction)}</p><img src="${escapeHtml(poster.imageUrl)}" width="${poster.width}" height="${poster.height}" alt="${escapeHtml(title)}"><section class="sr-only"><h2>Pool fixtures</h2><p>Kickoff times in ${escapeHtml(poster.timeZone)}.</p><ul>${fixtureList}</ul><p>${escapeHtml(accessibleNote)}</p></section><footer><a href="${escapeHtml(poster.imageUrl)}" download="rwc-${year}-${poster.teamId}-pool.png">Download PNG</a><a href="${escapeHtml(freshLink)}">Start fresh</a></footer></main></body></html>`;
}

function missingPoster(head: boolean): Response {
  const body = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Poster not found | RWC Predictor</title><body><main><h1>Poster not found</h1><p>Check the link, or <a href="/">make your predictions</a>.</p></main></body></html>';
  return new Response(head ? null : body, { status: 404, headers: { ...noCache, "Content-Type": "text/html; charset=utf-8" } });
}

/** No rendering on the server: public routes serve an immutable browser artifact. */
export async function handlePosterRequest(request: Request, db?: SharingDatabase, limiter?: ShareLimiter): Promise<Response | undefined> {
  const url = new URL(request.url);
  const collection = url.pathname === "/api/posters";
  const image = url.pathname.startsWith("/i/");
  const page = url.pathname.startsWith("/p/");
  if (!collection && !image && !page) return undefined;
  const head = request.method === "HEAD";
  const create = collection && request.method === "POST";
  if ((collection && !create) || (!collection && request.method !== "GET" && !head)) {
    return json({ error: "This method is not supported." }, 405, head, { Allow: collection ? "POST" : "GET, HEAD" });
  }
  if (create && request.headers.has("Origin") && request.headers.get("Origin") !== url.origin) {
    return json({ error: "Share posters from this site." }, 403);
  }
  if (!db) return json({ error: "Image sharing is unavailable. Download the image instead." }, 503, head);
  try {
    if (create) {
      if (limiter) {
        const ip = request.headers.get("CF-Connecting-IP") || "local";
        const permitted = await limiter.limit({ key: `create-poster:${ip}` });
        if (!permitted.success) return json({ error: "Please wait a moment before sharing again." }, 429, false, { "Retry-After": "60" });
      }
      return json(posterPublication(await createSharedPoster(db, await readPoster(request))), 200);
    }
    const alias = image && url.pathname.endsWith(".png")
      ? url.pathname.slice(3, -4) : page ? url.pathname.slice(3) : "";
    const poster = await readSharedPoster(db, alias);
    if (!poster) return page ? missingPoster(head) : json({ error: "Poster not found." }, 404, head);
    if (page) return new Response(head ? null : posterDocument(poster, url.origin), {
      headers: { ...pageCache, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'", "Referrer-Policy": "strict-origin-when-cross-origin" },
    });
    const etag = `"${poster.pngHash}"`;
    const headers = {
      ...imageCache, "Content-Type": "image/png", "Content-Length": String(poster.png.byteLength), ETag: etag,
      "Content-Disposition": `inline; filename="rwc-${decodeScenario(poster.token).tournamentId.slice(3)}-${poster.teamId}-pool.png"`,
    };
    if (request.headers.get("If-None-Match")?.split(",").some((value) => value.trim() === etag || value.trim() === "*" || value.trim() === `W/${etag}`)) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(head ? null : poster.png as Uint8Array<ArrayBuffer>, { headers });
  } catch (cause) {
    if (cause instanceof ShareInputError) return json({ error: cause.message }, cause.status, head);
    return json({ error: "Image sharing is unavailable. Download the image instead." }, 503, head);
  }
}
