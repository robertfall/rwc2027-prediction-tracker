import { decodeScenario, encodeScenario } from "../state/codec";
import { generateShareAlias, isShareAlias } from "./words";

// Only the D1 methods used here; the Worker does not need the Workers type package.
export interface SharingStatement {
  bind(...values: string[]): SharingStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<{ success: boolean }>;
}

export interface SharingDatabase {
  prepare(query: string): SharingStatement;
}

export interface SharedSnapshot {
  alias: string;
  token: string;
}

// Existing v2 frames are bounded to 8192 bytes. The small prefix fits this cap;
// v3 and legacy readers impose their own stricter payload/decompression limits.
export const MAX_SHARE_TOKEN_LENGTH = 12_000;
export const MAX_CANONICAL_TOKEN_LENGTH = 1369;
const MAX_ALIAS_ATTEMPTS = 8;

export class ShareInputError extends Error {
  constructor(message: string, readonly status: number = 400) { super(message); }
}

export function canonicalShareToken(value: unknown): string {
  if (typeof value !== "string" || !value) throw new ShareInputError("Provide one valid prediction token.");
  if (value.length > MAX_SHARE_TOKEN_LENGTH) throw new ShareInputError("That prediction link is too large.", 413);
  try {
    // Never construct a controller here: reconciliation would alter accepted
    // conflicting, dormant or unbound snapshots instead of preserving them.
    const token = encodeScenario(decodeScenario(value));
    if (token.length > MAX_CANONICAL_TOKEN_LENGTH) throw new Error("Oversized canonical token");
    return token;
  } catch {
    throw new ShareInputError("Provide one valid prediction token.");
  }
}

/** SHA-256 of the exact canonical token; callers must not hash a recomputed scenario. */
export async function fingerprintShareToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isShareFingerprint(value: unknown): value is string {
  return typeof value === "string" && value.length === 64 && /^[a-f0-9]{64}$/.test(value);
}

function checkedSnapshot(value: SharedSnapshot): SharedSnapshot {
  try {
    if (!isShareAlias(value.alias) || canonicalShareToken(value.token) !== value.token) throw new Error("Invalid stored snapshot");
  } catch {
    throw new Error("Stored snapshot is invalid.");
  }
  return { alias: value.alias, token: value.token };
}

export async function readSharedSnapshot(db: SharingDatabase, alias: string): Promise<SharedSnapshot | null> {
  if (!isShareAlias(alias)) return null;
  const row = await db.prepare("SELECT alias, token FROM shared_snapshots WHERE alias = ?1").bind(alias).first<SharedSnapshot>();
  return row ? checkedSnapshot(row) : null;
}

/** Read an existing snapshot without allocating an alias or changing stored state. */
export async function readSharedSnapshotByFingerprint(db: SharingDatabase, hash: unknown): Promise<SharedSnapshot | null> {
  if (!isShareFingerprint(hash)) throw new ShareInputError("Provide one valid snapshot fingerprint.");
  const row = await db.prepare("SELECT alias, token FROM shared_snapshots WHERE fingerprint = ?1").bind(hash).first<SharedSnapshot>();
  return row ? checkedSnapshot(row) : null;
}

/** Store an immutable exact snapshot, reusing the first alias for equal tokens. */
export async function createSharedSnapshot(
  db: SharingDatabase,
  input: unknown,
  nextAlias: () => string = generateShareAlias,
): Promise<SharedSnapshot> {
  const token = canonicalShareToken(input);
  const hash = await fingerprintShareToken(token);
  const find = () => db.prepare("SELECT alias, token FROM shared_snapshots WHERE fingerprint = ?1").bind(hash).first<SharedSnapshot>();
  const existing = await find();
  if (existing) {
    if (existing.token !== token) throw new Error("Snapshot fingerprint collision.");
    return checkedSnapshot(existing);
  }
  for (let attempt = 0; attempt < MAX_ALIAS_ATTEMPTS; attempt++) {
    const alias = nextAlias();
    if (!isShareAlias(alias)) throw new Error("Invalid generated alias.");
    // Both unique constraints are enforced by one atomic insert. No conflict
    // may overwrite either snapshot; concurrent equal requests share one row.
    const result = await db.prepare(
      "INSERT INTO shared_snapshots (alias, fingerprint, token) VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING",
    ).bind(alias, hash, token).run();
    if (!result.success) throw new Error("Snapshot insert failed.");
    const saved = await find();
    if (saved) {
      if (saved.token !== token) throw new Error("Snapshot fingerprint collision.");
      return checkedSnapshot(saved);
    }
    // A different snapshot won this alias. Draw another alias without touching it.
  }
  throw new Error("Could not allocate a share alias.");
}
