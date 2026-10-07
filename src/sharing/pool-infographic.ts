import displayFontUrl from "../assets/fonts/BarlowCondensed-700-latin.woff2?url";
import bodyFontUrl from "../assets/fonts/SourceSans3-latin.woff2?url";
import type { DerivedScenario, ResolvedFixture, Team, Winner } from "../domain/types";
import { POOL_POSTER_DIMENSIONS, POOL_POSTER_GRID as grid } from "./poster-layout";

export interface PoolInfographicOptions {
  locale?: string;
  timeZone?: string;
  showPredictions?: boolean;
}

export type PoolInfographicPrediction =
  | { kind: "none" }
  | { kind: "attention" }
  | { kind: "winner"; winner: Winner }
  | { kind: "score"; winner: Winner; homeScore: number; awayScore: number };

export interface PoolInfographicMatch {
  id: number;
  home: Team;
  away: Team;
  date: string;
  time: string;
  venue: string;
  prediction: PoolInfographicPrediction;
}

export interface PoolInfographicModel {
  team: Team;
  tournamentId: DerivedScenario["tournament"]["id"];
  pool: string;
  timeZone: string;
  title: string;
  filename: string;
  hasPredictions: boolean;
  matches: PoolInfographicMatch[];
}

export interface PoolInfographic {
  svg: string;
  filename: string;
  title: string;
}

const WIDTH = 1080;
const ROW_STEP = grid.cardHeight + grid.cardGap;
const ASSET_LIMIT = 256 * 1024;
const ASSET_TIMEOUT_MS = 5000;
const assets = new Map<string, string>();
const assetRequests = new Map<string, Promise<string | undefined>>();

function prediction(fixture: ResolvedFixture): PoolInfographicPrediction {
  if (fixture.issues.length > 0) return { kind: "attention" };
  if (fixture.result) return { kind: "score", winner: fixture.result.winner, homeScore: fixture.result.homeScore, awayScore: fixture.result.awayScore };
  const winner = fixture.prediction?.intent.winner;
  return winner ? { kind: "winner", winner } : { kind: "none" };
}

/** Copy the clicked fixture state before any flag or font requests can complete. */
export function buildPoolInfographicModel(derived: DerivedScenario, teamId: string, options: PoolInfographicOptions = {}): PoolInfographicModel {
  const team = derived.tournament.teams.find((candidate) => candidate.id === teamId);
  const pool = derived.tournament.pools.find((candidate) => candidate.teamIds.includes(teamId));
  if (!team || !pool) throw new RangeError("Choose a tournament team to share its pool matches.");
  const timeZone = options.timeZone ?? new Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dateFormat = new Intl.DateTimeFormat(options.locale, { weekday: "short", day: "numeric", month: "short", timeZone });
  const timeFormat = new Intl.DateTimeFormat(options.locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone });
  const teams = new Map(derived.tournament.teams.map((candidate) => [candidate.id, candidate]));
  const matches = derived.fixtures.filter((fixture) => fixture.stage === "pool" && fixture.pool === pool.id &&
    [fixture.home, fixture.away].some((source) => source.kind === "team" && source.teamId === teamId))
    .sort((first, second) => Date.parse(first.kickoff) - Date.parse(second.kickoff) || first.id - second.id)
    .map((fixture): PoolInfographicMatch => {
      const home = fixture.homeTeam ?? (fixture.home.kind === "team" ? teams.get(fixture.home.teamId) : undefined);
      const away = fixture.awayTeam ?? (fixture.away.kind === "team" ? teams.get(fixture.away.teamId) : undefined);
      if (!home || !away) throw new RangeError("This pool fixture has no known teams.");
      const date = new Date(fixture.kickoff);
      return { id: fixture.id, home: { ...home }, away: { ...away }, date: dateFormat.format(date), time: timeFormat.format(date), venue: fixture.venue,
        prediction: options.showPredictions === false ? { kind: "none" } : prediction(fixture) };
    });
  if (matches.length === 0) throw new RangeError("This team has no pool fixtures to share.");
  const slug = team.name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "team";
  return {
    team: { ...team }, tournamentId: derived.tournament.id, pool: pool.id, timeZone,
    title: `${team.name} pool matches`, filename: `${derived.tournament.id}-${slug}-pool-matches`,
    hasPredictions: matches.some((match) => match.prediction.kind !== "none"), matches,
  };
}

function xml(value: string | number): string {
  return Array.from(String(value)).filter((character) => character.codePointAt(0)! >= 32 || [9, 10, 13].includes(character.codePointAt(0)!)).join("").replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}

async function readAsset(response: Response): Promise<Uint8Array> {
  if (Number(response.headers.get("content-length")) > ASSET_LIMIT) throw new RangeError("The graphic asset is too large.");
  if (!response.body) throw new Error("The graphic asset is empty.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > ASSET_LIMIT) { await reader.cancel(); throw new RangeError("The graphic asset is too large."); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function safeFlag(source: string): boolean {
  return /^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(source) && /<\/svg>\s*$/i.test(source)
    && !/<!DOCTYPE|<script\b|<foreignObject\b|\bon\w+\s*=|\bhref\s*=\s*["'](?!#)|url\(\s*["']?(?!#)/i.test(source);
}

function loadAsset(url: string, kind: "flag" | "font"): Promise<string | undefined> {
  const cached = assets.get(url);
  if (cached) return Promise.resolve(cached);
  const pending = assetRequests.get(url);
  if (pending) return pending;
  const request = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ASSET_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return undefined;
      const bytes = await readAsset(response);
      if (bytes.length === 0 || (kind === "flag" && !safeFlag(new TextDecoder().decode(bytes)))) return undefined;
      const uri = `data:${kind === "flag" ? "image/svg+xml" : "font/woff2"};base64,${base64(bytes)}`;
      assets.set(url, uri);
      return uri;
    } catch { return undefined; }
    finally { clearTimeout(timeout); assetRequests.delete(url); }
  })();
  assetRequests.set(url, request);
  return request;
}

function flagUrl(flag: string): string | undefined {
  return /^[a-z]{2}(?:-[a-z]{3})?$/.test(flag) ? `${import.meta.env.BASE_URL}flags/4x3/${flag}.svg` : undefined;
}

function text(value: string | number, x: number, y: number, size: number, options: { fill?: string; anchor?: string; family?: "display" | "body"; spacing?: number; width?: number } = {}): string {
  return `<text x="${x}" y="${y}" fill="${options.fill ?? "#202A27"}" font-size="${size}" font-family="${options.family === "body" ? "Poster Body,Arial,sans-serif" : "Poster Display,Arial Narrow,Impact,sans-serif"}" font-weight="700" text-anchor="${options.anchor ?? "start"}"${options.spacing ? ` letter-spacing="${options.spacing}"` : ""}${options.width ? ` textLength="${options.width}" lengthAdjust="spacingAndGlyphs"` : ""}>${xml(value)}</text>`;
}

function heroLines(name: string): string[] {
  const words = name.toUpperCase().split(/\s+/);
  if (words.length < 2) return words;
  let split = 1;
  for (let index = 2; index < words.length; index++) {
    if (Math.abs(words.slice(0, index).join(" ").length - words.slice(index).join(" ").length) <
      Math.abs(words.slice(0, split).join(" ").length - words.slice(split).join(" ").length)) split = index;
  }
  return [words.slice(0, split).join(" "), words.slice(split).join(" ")];
}

function renderFlag(team: Team, flags: ReadonlyMap<string, string | undefined>, x: number, y: number, width: number): string {
  const height = width * 3 / 4;
  const uri = flags.get(team.flag);
  const frame = `<rect x="${x - 4}" y="${y - 4}" width="${width + 8}" height="${height + 8}" rx="3" fill="#F7F3E8"/>`;
  return frame + (uri ? `<image href="${uri}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>` :
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#E7DDCC"/>${text(team.shortName, x + width / 2, y + height / 2 + width / 12, width / 3, { anchor: "middle", fill: "#245C4A" })}`);
}

function winnerLabel(match: PoolInfographicMatch): string {
  if (match.prediction.kind !== "score" && match.prediction.kind !== "winner") return "";
  return match.prediction.winner === "draw" ? "DRAW PICK" : `${match.prediction.winner === "home" ? match.home.shortName : match.away.shortName} PICK`;
}

function renderPoster(model: PoolInfographicModel, flags: ReadonlyMap<string, string | undefined>, displayFont?: string, bodyFont?: string): string {
  const height = POOL_POSTER_DIMENSIONS[model.tournamentId].height;
  const fontCss = [displayFont ? `@font-face{font-family:'Poster Display';font-style:normal;font-weight:700;src:url('${displayFont}') format('woff2')}` : "",
    bodyFont ? `@font-face{font-family:'Poster Body';font-style:normal;font-weight:200 900;src:url('${bodyFont}') format('woff2')}` : ""].join("");
  const lines = heroLines(model.team.name);
  const name = lines.map((line, index) => text(line, 48, lines.length === 1 ? 300 : 228 + index * 132, lines.length === 1 ? 164 : 148,
    { fill: "#F7F3E8", ...(line.length > 8 ? { width: 650 } : {}) })).join("");
  const matches = model.matches.map((match, index) => {
    const y = grid.firstCard + index * ROW_STEP;
    const flagY = y + grid.outerPadding + grid.flagFrame;
    const flagBottom = grid.outerPadding + grid.flagFrame * 2 + grid.flagWidth * 3 / 4;
    const abbreviationCentre = (flagBottom + grid.separator) / 2;
    const abbreviationBaseline = y + abbreviationCentre + (grid.abbreviation.ascent - grid.abbreviation.descent) / 2;
    const dateBaseline = y + grid.dateInkBottom - grid.date.descent;
    const venueBaseline = y + grid.cardHeight - grid.outerPadding - grid.venue.descent;
    const picked = match.prediction.kind === "score" || match.prediction.kind === "winner";
    const score = match.prediction.kind === "score" ? `${match.prediction.homeScore} – ${match.prediction.awayScore}` : "VS";
    const winner = (match.prediction.kind === "score" || match.prediction.kind === "winner") && match.prediction.winner !== "draw" ? match.prediction.winner : undefined;
    return `<g id="match-${match.id}"><rect x="48" y="${y}" width="984" height="${grid.cardHeight}" rx="12" fill="#FFFFFF"/>
      <rect x="48" y="${y}" width="8" height="${grid.cardHeight}" rx="4" fill="${picked ? "#245C4A" : "#B84E32"}"/>
      ${renderFlag(match.home, flags, 196 - grid.flagWidth / 2, flagY, grid.flagWidth)}${renderFlag(match.away, flags, 884 - grid.flagWidth / 2, flagY, grid.flagWidth)}
      ${text(match.home.shortName, 196, abbreviationBaseline, grid.abbreviation.size, { anchor: "middle", fill: winner === "home" ? "#245C4A" : "#202A27" })}
      ${text(match.away.shortName, 884, abbreviationBaseline, grid.abbreviation.size, { anchor: "middle", fill: winner === "away" ? "#245C4A" : "#202A27" })}
      ${text(picked ? "PREDICTION" : `MATCH ${match.id}`, 540, y + 48, 20, { anchor: "middle", family: "body", fill: "#5C665F", spacing: 2 })}
      ${text(score, 540, y + 150, match.prediction.kind === "score" ? 96 : 88, { anchor: "middle", fill: match.prediction.kind === "score" ? "#245C4A" : "#B84E32" })}
      ${match.prediction.kind === "winner" ? `<rect x="450" y="${y + abbreviationCentre - 18}" width="180" height="36" rx="18" fill="#E7DDCC"/>${text(winnerLabel(match), 540, y + abbreviationCentre + 7, 23, { anchor: "middle", family: "body", fill: "#245C4A" })}` : ""}
      ${match.prediction.kind === "attention" ? text("Pick needs attention", 540, y + abbreviationCentre + 7, 23, { anchor: "middle", family: "body", fill: "#B84E32" }) : ""}
      <path d="M80 ${y + grid.separator}H1000" stroke="#E7DDCC"/>
      ${text(`${match.date.toUpperCase()}  ·  ${match.time}`, 540, dateBaseline, grid.date.size, { anchor: "middle", family: "body" })}
      ${text(match.venue, 540, venueBaseline, grid.venue.size, { anchor: "middle", family: "body", fill: "#5C665F" })}
    </g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-labelledby="poster-title poster-description">
    <title id="poster-title">${xml(model.title)}</title><desc id="poster-description">${xml(model.hasPredictions ? "Pool fixtures and predictions." : "Pool fixtures.")} ${xml(`Times in ${model.timeZone}.`)}</desc>
    <style>${fontCss}text{font-kerning:normal}</style><rect width="${WIDTH}" height="${height}" fill="#F7F3E8"/>
    <path d="M0 0H1080V400H0Z" fill="#245C4A"/><path d="M0 400H1080V420H0Z" fill="#B84E32"/>
    <path d="M875 0H947L727 400H655Z" fill="#F7F3E8" opacity=".06"/>
    ${text(`${model.tournamentId.toUpperCase().replace(/^RWC(?=\d)/, "RWC ")}  /  POOL ${model.pool}`, 48, 58, 27, { fill: "#F7F3E8", family: "body", spacing: 2 })}
    ${text(model.hasPredictions ? "FIXTURES & PREDICTIONS" : "FIXTURES", 48, 98, 22, { fill: "#F7F3E8", family: "body", spacing: 2 })}
    ${name}${renderFlag(model.team, flags, 752, 134, 280)}
    ${matches}<path d="M48 ${height - 116}H1032" stroke="#D6D0C3"/>
    ${text("MAKE YOUR PREDICTIONS", 48, height - 72, 32, { fill: "#245C4A" })}
    ${text("rwc2027.myplaceforthings.com", 1032, height - 74, 27, { fill: "#5C665F", anchor: "end", family: "body" })}
    ${text(`Times in ${model.timeZone}`, 48, height - 36, 27, { fill: "#5C665F", family: "body" })}
  </svg>`;
}

/** A standalone poster. The filename is a base name without a file extension. */
export async function createPoolInfographic(derived: DerivedScenario, teamId: string, options: PoolInfographicOptions = {}): Promise<PoolInfographic> {
  const model = buildPoolInfographicModel(derived, teamId, options);
  const flagNames = [...new Set([model.team, ...model.matches.flatMap((match) => [match.home, match.away])].map((team) => team.flag))];
  const [flags, displayFont, bodyFont] = await Promise.all([
    Promise.all(flagNames.map(async (flag) => { const url = flagUrl(flag); return [flag, url ? await loadAsset(url, "flag") : undefined] as const; })),
    loadAsset(displayFontUrl, "font"), loadAsset(bodyFontUrl, "font"),
  ]);
  return { svg: renderPoster(model, new Map(flags), displayFont, bodyFont), filename: model.filename, title: model.title };
}

/** Rasterize the captured poster locally. Callers can offer its SVG if this fails. */
export async function rasterizePoolInfographic(svg: string): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("The graphic could not be loaded.")); image.src = url; });
    if (image.naturalWidth !== WIDTH || image.naturalHeight < 1000 || image.naturalHeight > 2400) throw new RangeError("The graphic dimensions are not supported.");
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("PNG export is not available in this browser.");
    context.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG export is not available in this browser.")), "image/png"));
  } finally { URL.revokeObjectURL(url); }
}
