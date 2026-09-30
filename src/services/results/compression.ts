import type { MatchNumber } from "../../data/fixtures";
import {
  isValidResultFieldValue,
  resultFields,
  type Result,
  type TouchedResult,
} from "./model";

export const CURRENT_LINK_IDENTITY = {
  tournament: "rwc2023",
  dataset: "fixtures-v1",
} as const;
export type LinkIdentity = { tournament: string; dataset: string };
const VERSION = "v1";
const TOUCHED = 16;

export class PredictionLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PredictionLinkError";
  }
}

function fail(message = "The prediction link is malformed."): never {
  throw new PredictionLinkError(message);
}

function toBase64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}

function fromBase64(value: string, urlSafe: boolean): Uint8Array {
  if (!value || value.length > 4096) fail();
  if (urlSafe ? !/^[A-Za-z0-9_-]+$/.test(value) : !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) fail();
  const normalized = urlSafe ? value.replace(/-/g, "+").replace(/_/g, "/") : value;
  if (normalized.length % 4 === 1) fail();
  try {
    const bytes = Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
    if (toBase64(bytes).replace(/=+$/, "") !== normalized.replace(/=+$/, "")) fail();
    return bytes;
  } catch {
    return fail();
  }
}

function validatePackingResult(result: Result): void {
  // The codec packs byte-sized IDs; the storage/model boundary validates the active fixtures.
  if (!Number.isInteger(result.matchNumber) || result.matchNumber < 1 || result.matchNumber > 255 ||
    typeof result.touched !== "boolean" || resultFields.some((field) => {
      const value = result.touched ? result[field] : (result as unknown as Record<string, unknown>)[field];
      return value !== undefined && (!result.touched || !isValidResultFieldValue(field, value));
    })) fail("Predictions contain invalid match numbers or scoring values.");
}

/** Sparse, explicit IDs and field-presence bits preserve partial edits and zero values. */
export function encode(results: Result[], identity: LinkIdentity = CURRENT_LINK_IDENTITY): string {
  if (results.length > 255 || !/^[A-Za-z0-9_-]+$/.test(identity.tournament) ||
    !/^[A-Za-z0-9_-]+$/.test(identity.dataset)) fail();
  const bytes = [results.length];
  const ids = new Set<number>();
  for (const result of results) {
    validatePackingResult(result);
    if (ids.has(result.matchNumber)) fail("The prediction link repeats a match number.");
    ids.add(result.matchNumber);
    let mask = result.touched ? TOUCHED : 0;
    const values: number[] = [];
    if (result.touched) {
      resultFields.forEach((field, index) => {
        if (result[field] !== undefined) {
          mask |= 1 << index;
          values.push(result[field]!);
        }
      });
    }
    bytes.push(result.matchNumber, mask, ...values);
  }
  const packed = toBase64(new Uint8Array(bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${VERSION}.${identity.tournament}.${identity.dataset}.${packed}`;
}

function decodeCurrent(value: string, expected: LinkIdentity): Result[] {
  const parts = value.split(".");
  if (parts[0] !== VERSION) fail("This prediction link uses an unsupported version.");
  if (parts.length !== 4) fail();
  if (parts[1] !== expected.tournament || parts[2] !== expected.dataset) {
    fail("This prediction link belongs to a different tournament or fixture dataset.");
  }
  const bytes = fromBase64(parts[3], true);
  const results: Result[] = [];
  const ids = new Set<number>();
  let cursor = 1;
  for (let index = 0; index < bytes[0]; index++) {
    if (cursor + 2 > bytes.length) fail();
    const rawMatchNumber = bytes[cursor++];
    const matchNumber = rawMatchNumber as MatchNumber;
    const mask = bytes[cursor++];
    if (rawMatchNumber === 0 || ids.has(matchNumber) || mask > 31 || (mask !== 0 && !(mask & TOUCHED))) fail();
    ids.add(matchNumber);
    if (mask === 0) {
      results.push({ matchNumber, touched: false });
      continue;
    }
    const result: TouchedResult = { matchNumber, touched: true };
    resultFields.forEach((field, fieldIndex) => {
      if (mask & (1 << fieldIndex)) {
        if (cursor >= bytes.length || !isValidResultFieldValue(field, bytes[cursor])) fail();
        result[field] = bytes[cursor++];
      }
    });
    results.push(result);
  }
  if (cursor !== bytes.length) fail();
  return results;
}

function decodeLegacy(value: string, expected: LinkIdentity): Result[] {
  if (expected.tournament !== CURRENT_LINK_IDENTITY.tournament || expected.dataset !== CURRENT_LINK_IDENTITY.dataset) {
    fail("Legacy prediction links belong to the 2023 tournament.");
  }
  const bytes = fromBase64(value, false);
  const count = bytes[0];
  if (count < 1 || count > 48) fail("The legacy prediction link has an invalid 2023 match count.");
  const bitmapLength = Math.ceil(count / 8);
  if (bytes.length < 1 + bitmapLength) fail();
  if (count % 8 && (bytes[bitmapLength] >> (count % 8)) !== 0) fail();
  let cursor = 1 + bitmapLength;
  const results: Result[] = [];
  for (let index = 0; index < count; index++) {
    const matchNumber = (index + 1) as MatchNumber;
    if (!(bytes[1 + Math.floor(index / 8)] & (1 << (index % 8)))) {
      results.push({ matchNumber, touched: false });
      continue;
    }
    if (cursor + 3 > bytes.length) fail();
    const homeScore = bytes[cursor++];
    const awayScore = bytes[cursor++];
    const tries = bytes[cursor++];
    results.push({ matchNumber, touched: true, homeScore, awayScore, homeTries: tries >> 4, awayTries: tries & 15 });
  }
  if (cursor !== bytes.length) fail();
  return results;
}

export function decode(encoded: string, expected: LinkIdentity = CURRENT_LINK_IDENTITY): Result[] {
  return encoded.includes(".") ? decodeCurrent(encoded, expected) : decodeLegacy(encoded, expected);
}
