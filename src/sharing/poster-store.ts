import { getTournament } from "../domain/tournaments";
import { decodeScenario, encodeScenario } from "../state/codec";
import { canonicalShareToken, fingerprintShareToken, isShareFingerprint, ShareInputError, type SharingDatabase } from "./store";
import { generateShareAlias, isShareAlias } from "./words";
import { POOL_POSTER_DIMENSIONS } from "./poster-layout";

export const POSTER_RENDERER_VERSION = "pool-poster-v2";
export const MAX_POSTER_PNG_BYTES = 512 * 1024;
export const MAX_POSTER_BASE64_LENGTH = 4 * Math.ceil(MAX_POSTER_PNG_BYTES / 3);
const MAX_ALIAS_ATTEMPTS = 8;
const inputKeys = ["token", "teamId", "timeZone", "showPredictions", "rendererVersion", "png"];
const priorPosterHeights = { rwc2027: 1536, rwc2023: 1850 };

export interface PosterPublication {
  alias: string;
  token: string;
  teamId: string;
  timeZone: string;
  showPredictions: boolean;
  rendererVersion: typeof POSTER_RENDERER_VERSION;
  imageUrl: string;
  pageUrl: string;
}

export interface SharedPoster extends PosterPublication {
  png: Uint8Array;
  pngHash: string;
  width: number;
  height: number;
}

interface PosterRow {
  alias: string;
  token: string;
  teamId: string;
  timeZone: string;
  showPredictions: string;
  rendererVersion: string;
  pngHash: string;
  png: string;
}

interface ValidatedPoster {
  token: string;
  teamId: string;
  timeZone: string;
  showPredictions: boolean;
  rendererVersion: typeof POSTER_RENDERER_VERSION;
  png: string;
  bytes: Uint8Array;
  width: number;
  height: number;
}

const selectPoster = "SELECT alias, token, team_id AS teamId, time_zone AS timeZone, show_predictions AS showPredictions, renderer_version AS rendererVersion, png_hash AS pngHash, png FROM shared_posters";
const crcTable = new Uint32Array(256);
for (let index = 0; index < crcTable.length; index++) {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  crcTable[index] = value >>> 0;
}

function badImage(): never { throw new ShareInputError("Provide a valid pool poster PNG."); }

/** Check a bounded PNG envelope, not its pixels or the correctness of predictions. */
export function validatePosterPng(
  value: unknown,
  tournamentId: "rwc2027" | "rwc2023",
  options: { allowPriorDimensions?: boolean } = {},
): { bytes: Uint8Array; width: number; height: number } {
  if (typeof value !== "string" || !value) badImage();
  if (value.length > MAX_POSTER_BASE64_LENGTH) throw new ShareInputError("That poster image is too large.", 413);
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) badImage();
  let binary: string;
  try { binary = atob(value); } catch { badImage(); }
  if (btoa(binary) !== value) badImage();
  if (binary.length > MAX_POSTER_PNG_BYTES) throw new ShareInputError("That poster image is too large.", 413);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 57 || !signature.every((byte, index) => bytes[index] === byte)) badImage();
  const view = new DataView(bytes.buffer);
  let position = 8;
  let width = 0;
  let height = 0;
  let imageData = false;
  let endedImageData = false;
  let ended = false;
  while (position < bytes.length) {
    if (bytes.length - position < 12) badImage();
    const length = view.getUint32(position);
    if (length > bytes.length - position - 12) badImage();
    const typeBytes = bytes.subarray(position + 4, position + 8);
    if (!typeBytes.every((byte) => (byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122))) badImage();
    const type = String.fromCharCode(...typeBytes);
    if (typeBytes[2] >= 97) badImage(); // PNG's reserved chunk-type bit must be zero.
    let crc = 0xffffffff;
    for (let offset = position + 4; offset < position + 8 + length; offset++) crc = crcTable[(crc ^ bytes[offset]) & 255] ^ (crc >>> 8);
    if ((crc ^ 0xffffffff) >>> 0 !== view.getUint32(position + 8 + length)) badImage();
    if (position === 8) {
      if (type !== "IHDR" || length !== 13) badImage();
      width = view.getUint32(position + 8);
      height = view.getUint32(position + 12);
      const expected = POOL_POSTER_DIMENSIONS[tournamentId];
      const validHeight = height === expected.height || (options.allowPriorDimensions && height === priorPosterHeights[tournamentId]);
      if (width !== expected.width || !validHeight
        || bytes[position + 16] !== 8 || ![2, 6].includes(bytes[position + 17])
        || bytes[position + 18] !== 0 || bytes[position + 19] !== 0 || bytes[position + 20] !== 0) badImage();
    } else if (type === "IHDR" || ["acTL", "fcTL", "fdAT"].includes(type)) badImage();
    if (type === "IDAT") {
      if (endedImageData) badImage();
      if (length > 0) imageData = true;
    } else if (imageData) endedImageData = true;
    if (type === "IEND") {
      if (length !== 0 || !imageData || position + length + 12 !== bytes.length) badImage();
      ended = true;
    } else if (typeBytes[0] < 97 && !["IHDR", "PLTE", "IDAT"].includes(type)) badImage();
    position += length + 12;
  }
  if (!ended) badImage();
  return { bytes, width, height };
}

function validatePoster(value: unknown, allowPriorDimensions = false): ValidatedPoster {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== inputKeys.length || inputKeys.some((key) => !Object.hasOwn(value, key))) {
    throw new ShareInputError("Provide one valid pool poster.");
  }
  const input = value as Record<string, unknown>;
  let token = canonicalShareToken(input.token);
  const scenario = decodeScenario(token);
  const tournament = getTournament(scenario.tournamentId);
  if (typeof input.teamId !== "string" || !tournament.teams.some((team) => team.id === input.teamId)) {
    throw new ShareInputError("Choose a team in this tournament.");
  }
  if (typeof input.timeZone !== "string" || input.timeZone.length > 100 || !input.timeZone
    || !/^[A-Za-z0-9_+/-]+$/.test(input.timeZone)) throw new ShareInputError("Choose a supported timezone.");
  try { new Intl.DateTimeFormat("en", { timeZone: input.timeZone }).format(0); }
  catch { throw new ShareInputError("Choose a supported timezone."); }
  if (typeof input.showPredictions !== "boolean" || input.rendererVersion !== POSTER_RENDERER_VERSION) {
    throw new ShareInputError("Provide one valid pool poster.");
  }
  // Hiding predictions must not publish those picks through the linked app state.
  if (!input.showPredictions) token = encodeScenario({ ...scenario, predictions: {}, resolved: {} });
  const image = validatePosterPng(input.png, tournament.id, { allowPriorDimensions });
  return {
    token, teamId: input.teamId, timeZone: input.timeZone, showPredictions: input.showPredictions,
    rendererVersion: POSTER_RENDERER_VERSION, png: input.png as string, ...image,
  };
}

export function posterPublication(poster: SharedPoster): PosterPublication {
  const { alias, token, teamId, timeZone, showPredictions, rendererVersion, imageUrl, pageUrl } = poster;
  return { alias, token, teamId, timeZone, showPredictions, rendererVersion, imageUrl, pageUrl };
}

function checkedPoster(row: PosterRow): SharedPoster {
  try {
    if (!isShareAlias(row.alias) || !isShareFingerprint(row.pngHash) || !["true", "false"].includes(row.showPredictions)) throw new Error("Invalid stored values");
    const input = validatePoster({
      token: row.token, teamId: row.teamId, timeZone: row.timeZone,
      showPredictions: row.showPredictions === "true", rendererVersion: row.rendererVersion, png: row.png,
    }, true);
    if (input.token !== row.token) throw new Error("Invalid stored token");
    return {
      alias: row.alias, token: input.token, teamId: input.teamId, timeZone: input.timeZone,
      showPredictions: input.showPredictions, rendererVersion: input.rendererVersion,
      imageUrl: `/i/${row.alias}.png`, pageUrl: `/p/${row.alias}`,
      png: input.bytes, pngHash: row.pngHash, width: input.width, height: input.height,
    };
  } catch { throw new Error("Stored poster is invalid."); }
}

export async function readSharedPoster(db: SharingDatabase, alias: string): Promise<SharedPoster | null> {
  if (!isShareAlias(alias)) return null;
  const row = await db.prepare(`${selectPoster} WHERE alias = ?1`).bind(alias).first<PosterRow>();
  return row ? checkedPoster(row) : null;
}

/** The image is a user-created artifact; PNG validation does not certify its content. */
export async function createSharedPoster(db: SharingDatabase, value: unknown, nextAlias: () => string = generateShareAlias): Promise<SharedPoster> {
  const input = validatePoster(value);
  const digest = await crypto.subtle.digest("SHA-256", input.bytes as Uint8Array<ArrayBuffer>);
  const pngHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const fingerprint = await fingerprintShareToken(JSON.stringify([
    input.token, input.teamId, input.timeZone, input.showPredictions, input.rendererVersion, pngHash,
  ]));
  const find = () => db.prepare(`${selectPoster} WHERE fingerprint = ?1`).bind(fingerprint).first<PosterRow>();
  const check = (row: PosterRow): SharedPoster => {
    if (row.token !== input.token || row.teamId !== input.teamId || row.timeZone !== input.timeZone
      || row.showPredictions !== String(input.showPredictions) || row.rendererVersion !== input.rendererVersion
      || row.pngHash !== pngHash || row.png !== input.png) throw new Error("Poster fingerprint collision.");
    return checkedPoster(row);
  };
  const existing = await find();
  if (existing) return check(existing);
  for (let attempt = 0; attempt < MAX_ALIAS_ATTEMPTS; attempt++) {
    const alias = nextAlias();
    if (!isShareAlias(alias)) throw new Error("Invalid generated alias.");
    const result = await db.prepare(
      "INSERT INTO shared_posters (alias, fingerprint, token, team_id, time_zone, show_predictions, renderer_version, png_hash, png) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) ON CONFLICT DO NOTHING",
    ).bind(alias, fingerprint, input.token, input.teamId, input.timeZone, String(input.showPredictions), input.rendererVersion, pngHash, input.png).run();
    if (!result.success) throw new Error("Poster insert failed.");
    const saved = await find();
    if (saved) return check(saved);
  }
  throw new Error("Could not allocate a poster alias.");
}
