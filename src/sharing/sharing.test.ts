/// <reference types="node" />

import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { encodeScenario, decodeScenario } from "../state/codec";
import { emptyScenario } from "../state/controller";
import { getTournament } from "../domain/tournaments";
import { encode as encodeLegacyVersion } from "../services/results/compression";
import worker from "../worker";
import { handleShareRequest, MAX_SHARE_BODY_BYTES } from "./http";
import { canonicalShareToken, createSharedSnapshot, fingerprintShareToken, MAX_SHARE_TOKEN_LENGTH, readSharedSnapshot, readSharedSnapshotByFingerprint, type SharingDatabase, type SharingStatement } from "./store";
import { SHARE_WORDS } from "./words";

const migration = readFileSync(new URL("../../migrations/0001_shared_snapshots.sql", import.meta.url), "utf8");
const origin = "https://rwc2027.myplaceforthings.com";
const aliasA = `${SHARE_WORDS[0]}.${SHARE_WORDS[1]}.${SHARE_WORDS[2]}`;
const aliasB = `${SHARE_WORDS[3]}.${SHARE_WORDS[4]}.${SHARE_WORDS[5]}`;

/** Real SQLite exercises the migration's uniqueness and atomic UPSERT behavior. */
class SqliteShares implements SharingDatabase {
  readonly sqlite = new DatabaseSync(":memory:");
  private pending: (() => void)[] = [];
  constructor(private initialReadBarrier = 0) { this.sqlite.exec(migration); }
  prepare(query: string): SharingStatement {
    const bind = (...values: string[]): SharingStatement => ({
      bind,
      first: async <T>() => {
        const row = this.sqlite.prepare(query).get(...values) as T | undefined;
        if (!row && query.includes("WHERE fingerprint") && this.initialReadBarrier > 0) {
          this.initialReadBarrier--;
          await new Promise<void>((resolve) => {
            this.pending.push(resolve);
            if (this.initialReadBarrier === 0) this.pending.splice(0).forEach((release) => release());
          });
        }
        return row ?? null;
      },
      run: async () => { this.sqlite.prepare(query).run(...values); return { success: true }; },
    });
    return bind();
  }
  count(): number { return Number(this.sqlite.prepare("SELECT count(*) AS count FROM shared_snapshots").get()!.count); }
  close(): void { this.sqlite.close(); }
}

function changedToken(winner: "home" | "away" = "home"): string {
  const scenario = emptyScenario();
  scenario.predictions[1] = { intent: { winner } };
  return encodeScenario(scenario);
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${origin}/api/shares`, {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
  });
}

describe("Immutable shared snapshots", () => {
  let db: SqliteShares;
  beforeEach(() => { db = new SqliteShares(); });
  afterEach(() => { db.close(); });

  it("deduplicates exact canonical tokens and never overwrites an occupied alias", async () => {
    const first = await createSharedSnapshot(db, changedToken(), () => aliasA);
    expect(await createSharedSnapshot(db, first.token, () => { throw new Error("Must reuse stored alias"); })).toEqual(first);
    let attempts = 0;
    const second = await createSharedSnapshot(db, changedToken("away"), () => attempts++ === 0 ? aliasA : aliasB);
    expect(second.alias).toBe(aliasB);
    expect(attempts).toBe(2);
    expect(await readSharedSnapshot(db, aliasA)).toEqual(first);
    expect(await readSharedSnapshot(db, aliasB)).toEqual(second);
    expect(db.count()).toBe(2);
    expect(() => db.sqlite.prepare("UPDATE shared_snapshots SET token = ?1 WHERE alias = ?2").run(second.token, aliasA)).toThrow(/immutable/);
  });

  it("deduplicates concurrent equal creations after every request observes an empty database", async () => {
    const count = 16;
    const concurrent = new SqliteShares(count);
    try {
      const results = await Promise.all(Array.from({ length: count }, (_, index) => createSharedSnapshot(
        concurrent, changedToken(), () => `${SHARE_WORDS[index]}.${SHARE_WORDS[1]}.${SHARE_WORDS[2]}`,
      )));
      expect(new Set(results.map((result) => result.alias)).size).toBe(1);
      expect(results.every((result) => result.token === changedToken())).toBe(true);
      expect(concurrent.count()).toBe(1);
    } finally { concurrent.close(); }
  });

  it("bounds collision retries without changing an existing snapshot", async () => {
    const first = await createSharedSnapshot(db, changedToken(), () => aliasA);
    let attempts = 0;
    await expect(createSharedSnapshot(db, changedToken("away"), () => { attempts++; return aliasA; })).rejects.toThrow(/allocate/);
    expect(attempts).toBe(8);
    expect(await readSharedSnapshot(db, aliasA)).toEqual(first);
    expect(db.count()).toBe(1);
  });

  it("preserves conflicting intent, explicit zero/false, custom dormant pins and absent saved maps", async () => {
    const scenario = emptyScenario();
    const knockout = getTournament("rwc2027").fixtures.find((fixture) => fixture.stage !== "pool")!;
    scenario.predictions[1] = { intent: { winner: "home", homeScore: 0, awayScore: 0, margin: 0, homeTryBonus: false, homeLosingBonus: false } };
    scenario.predictions[knockout.id] = { intent: { advancing: "home" }, participants: ["nz", "za"] };
    scenario.resolved![knockout.id] = { homeScore: 58, awayScore: 8, homeTries: 8, awayTries: 1, winner: "home", advancing: "home" };
    const token = encodeScenario(scenario);
    const saved = await createSharedSnapshot(db, token, () => aliasA);
    expect(decodeScenario(saved.token)).toEqual(scenario);
    expect(decodeScenario((await readSharedSnapshot(db, saved.alias))!.token)).toEqual(scenario);
    expect(decodeScenario((await readSharedSnapshotByFingerprint(db, await fingerprintShareToken(token)))!.token)).toEqual(scenario);
    delete scenario.resolved;
    const absent = await createSharedSnapshot(db, encodeScenario(scenario), () => aliasB);
    expect(absent.alias).not.toBe(saved.alias);
    expect(decodeScenario(absent.token)).toEqual(scenario);
    expect(decodeScenario(absent.token)).not.toHaveProperty("resolved");
    expect(await readSharedSnapshotByFingerprint(db, await fingerprintShareToken(absent.token))).toEqual(absent);
  });

  it("finds only existing exact fingerprints without inserting or allocating an alias", async () => {
    expect(await fingerprintShareToken("v3.AYA")).toBe("24b1ab6e69e8d34f100e65568d93897f4df2514a548268416df2adba82ef8a8c");
    const hash = await fingerprintShareToken(changedToken());
    expect(await readSharedSnapshotByFingerprint(db, hash)).toBeNull();
    expect(db.count()).toBe(0);
    const saved = await createSharedSnapshot(db, changedToken(), () => aliasA);
    expect(await readSharedSnapshotByFingerprint(db, hash)).toEqual(saved);
    expect(await readSharedSnapshotByFingerprint(db, await fingerprintShareToken(changedToken("away")))).toBeNull();
    expect(db.count()).toBe(1);
    const prepare = vi.spyOn(db, "prepare");
    for (const value of [undefined, null, "", "a".repeat(63), "A".repeat(64), "g".repeat(64), "a".repeat(65), `${"a".repeat(64)}\n`, "a' OR 1=1"]) {
      await expect(readSharedSnapshotByFingerprint(db, value)).rejects.toThrow(/valid snapshot fingerprint/);
    }
    expect(prepare).not.toHaveBeenCalled();
  });

  it("preserves arbitrary accepted sparse constraints through canonical storage", async () => {
    await fc.assert(fc.asyncProperty(fc.uniqueArray(fc.record({
      id: fc.integer({ min: 1, max: 52 }),
      homeScore: fc.integer({ min: 0, max: 255 }),
      awayScore: fc.integer({ min: 0, max: 255 }),
      homeTries: fc.integer({ min: 0, max: 15 }),
      homeTryBonus: fc.boolean(),
      winner: fc.constantFrom("home" as const, "away" as const, "draw" as const),
    }), { selector: (row) => row.id, maxLength: 52 }), async (rows) => {
      const scenario = emptyScenario();
      scenario.predictions = Object.fromEntries(rows.map(({ id, ...intent }) => [id, { intent }]));
      const result = await createSharedSnapshot(db, encodeScenario(scenario));
      expect(decodeScenario(result.token)).toEqual(scenario);
      expect(await readSharedSnapshot(db, result.alias)).toEqual(result);
    }), { numRuns: 50 });
  });

  it("canonicalizes both legacy readers and original v2 snapshots without reconciling", async () => {
    const v2 = "v2.rwc2027.fixtures-2026-02.AE4ARItWKijKL8sszszPS8zRLTNU0lFKSU1LLM0pKQbzoqMNdQx1opUy8nNTlWJ18kpzcnSijUx0DM11jHWMdCDiYOFYIAAA";
    const saved = await createSharedSnapshot(db, v2, () => aliasA);
    expect(saved.token).toBe("v3.AYIKQA");
    expect(await createSharedSnapshot(db, saved.token)).toEqual(saved);
    const v1 = encodeLegacyVersion([{ matchNumber: 1, touched: true, homeScore: 31, awayScore: 24, homeTries: 4, awayTries: 2 }]);
    const legacy = btoa(String.fromCharCode(1, 1, 31, 24, 0x42));
    expect(decodeScenario(canonicalShareToken(v1))).toEqual(decodeScenario(v1));
    expect(canonicalShareToken(v1)).toBe(canonicalShareToken(legacy));
    expect(db.count()).toBe(1);
  });

  it.each(["", "v3.!", "v9.AYA", "https://elsewhere.example", null, 1])("rejects invalid tokens before creating records (%j)", async (token) => {
    await expect(createSharedSnapshot(db, token)).rejects.toThrow(/valid prediction token/);
    expect(db.count()).toBe(0);
  });
});

describe("Sharing HTTP routes", () => {
  let db: SqliteShares;
  beforeEach(() => { db = new SqliteShares(); });
  afterEach(() => { db.close(); });

  it("creates and looks up one snapshot, and redirects GET/HEAD to an exact same-origin full link", async () => {
    const created = await handleShareRequest(post({ token: changedToken() }), db);
    expect(created!.status).toBe(200);
    expect(created!.headers.get("Cache-Control")).toBe("no-store");
    const saved = await created!.json() as { alias: string; token: string };
    for (const method of ["GET", "HEAD"]) {
      const lookup = await handleShareRequest(new Request(`${origin}/api/shares/${saved.alias}`, { method }), db);
      expect(lookup!.status).toBe(200);
      expect(lookup!.headers.get("Content-Type")).toMatch(/application\/json/);
      if (method === "GET") expect(await lookup!.json()).toEqual(saved);
      else expect(await lookup!.text()).toBe("");
      const redirect = await handleShareRequest(new Request(`${origin}/s/${saved.alias}`, { method }), db);
      expect(redirect!.status).toBe(302);
      expect(redirect!.headers.get("Location")).toBe(`/#predictions=${saved.token}`);
      expect(new URL(redirect!.headers.get("Location")!, origin).origin).toBe(origin);
      expect(redirect!.headers.get("Cache-Control")).toBe("public, max-age=3600");
      expect(await redirect!.text()).toBe("");
    }
  });

  it.each([{}, { token: changedToken(), extra: true }, { token: null }, [], "token"])("rejects unknown/invalid JSON fields (%j)", async (body) => {
    const result = await handleShareRequest(post(body), db);
    expect(result!.status).toBe(400);
    expect(db.count()).toBe(0);
  });

  it("bounds declared, actual streamed and token lengths before storage", async () => {
    expect((await handleShareRequest(post({}, { "Content-Length": String(MAX_SHARE_BODY_BYTES + 1) }), db))!.status).toBe(413);
    expect((await handleShareRequest(post({ token: "A".repeat(MAX_SHARE_TOKEN_LENGTH + 1) }), db))!.status).toBe(413);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_SHARE_BODY_BYTES));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    });
    const request = new Request(`${origin}/api/shares`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: stream, duplex: "half",
    } as RequestInit);
    expect((await handleShareRequest(request, db))!.status).toBe(413);
    expect(db.count()).toBe(0);
  });

  it("rejects malformed JSON, incorrect MIME and malformed UTF-8", async () => {
    expect((await handleShareRequest(new Request(`${origin}/api/shares`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }), db))!.status).toBe(400);
    expect((await handleShareRequest(post({ token: changedToken() }, { "Content-Type": "text/plain" }), db))!.status).toBe(415);
    expect((await handleShareRequest(new Request(`${origin}/api/shares`, { method: "POST", headers: { "Content-Type": "application/json" }, body: new Uint8Array([0xff]) }), db))!.status).toBe(400);
  });

  it("returns controlled missing, method and database errors without cacheable failures", async () => {
    expect((await handleShareRequest(post({ token: changedToken() })))!.status).toBe(503);
    const missing = await handleShareRequest(new Request(`${origin}/s/${aliasA}`), db);
    expect(missing!.status).toBe(404);
    expect(missing!.headers.get("Cache-Control")).toBe("no-store");
    expect(await missing!.text()).toContain("Prediction link not found");
    const invalid = await handleShareRequest(new Request(`${origin}/api/shares/https://evil.example`), db);
    expect(invalid!.status).toBe(404);
    expect((await handleShareRequest(new Request(`${origin}/s/${aliasA}`, { method: "HEAD" }), db))!.body).toBeNull();
    const method = await handleShareRequest(new Request(`${origin}/api/shares`, { method: "DELETE" }), db);
    expect(method!.status).toBe(405);
    expect(method!.headers.get("Allow")).toBe("GET, HEAD, POST");
    const broken = { prepare() { throw new Error("Private database details"); } };
    const unavailable = await handleShareRequest(post({ token: changedToken() }), broken);
    expect(unavailable!.status).toBe(503);
    expect(await unavailable!.text()).not.toContain("Private database details");
  });

  it("looks up exact snapshots by fingerprint with GET/HEAD and never limits or inserts reads", async () => {
    const token = changedToken();
    const hash = await fingerprintShareToken(token);
    const requestUrl = `${origin}/api/shares?fingerprint=${hash}`;
    const limit = vi.fn(async () => ({ success: false }));
    const missing = await handleShareRequest(new Request(requestUrl), db, { limit });
    expect(missing!.status).toBe(404);
    expect(missing!.headers.get("Cache-Control")).toBe("no-store");
    expect(db.count()).toBe(0);
    const saved = await createSharedSnapshot(db, token, () => aliasA);
    for (const method of ["GET", "HEAD"]) {
      const result = await handleShareRequest(new Request(requestUrl, { method }), db, { limit });
      expect(result!.status).toBe(200);
      expect(result!.headers.get("Cache-Control")).toBe("public, max-age=3600");
      expect(result!.headers.get("Content-Type")).toMatch(/application\/json/);
      if (method === "GET") expect(await result!.json()).toEqual(saved);
      else expect(await result!.text()).toBe("");
    }
    expect(limit).not.toHaveBeenCalled();
    expect(db.count()).toBe(1);
  });

  it.each([
    "", "?fingerprint=", "?fingerprint=invalid", `?fingerprint=${"a".repeat(63)}`,
    `?fingerprint=${"A".repeat(64)}`, `?fingerprint=${"g".repeat(64)}`, `?fingerprint=${"a".repeat(65)}`,
    `?fingerprint=${"a".repeat(64)}%0A`,
    `?fingerprint=${"a".repeat(64)}&extra=true`, `?fingerprint=${"a".repeat(64)}&fingerprint=${"b".repeat(64)}`,
    `?token=${changedToken()}`,
  ])("rejects missing, malformed, duplicate or unknown lookup parameters (%s)", async (query) => {
    for (const method of ["GET", "HEAD"]) {
      const result = await handleShareRequest(new Request(`${origin}/api/shares${query}`, { method }), db);
      expect(result!.status).toBe(400);
      expect(result!.headers.get("Cache-Control")).toBe("no-store");
      if (method === "HEAD") expect(await result!.text()).toBe("");
    }
    expect(db.count()).toBe(0);
  });

  it("limits only creation by Cloudflare client IP, returns retry guidance and fails closed", async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const request = post({ token: changedToken() }, { "CF-Connecting-IP": "192.0.2.1" });
    const denied = await handleShareRequest(request, db, { limit });
    expect(denied!.status).toBe(429);
    expect(denied!.headers.get("Retry-After")).toBe("60");
    expect(limit).toHaveBeenCalledWith({ key: "create-share:192.0.2.1" });
    expect(db.count()).toBe(0);
    await handleShareRequest(new Request(`${origin}/s/${aliasA}`), db, { limit });
    expect(limit).toHaveBeenCalledTimes(1);
    const broken = { limit: async () => { throw new Error("Private rate-limiter details"); } };
    const unavailable = await handleShareRequest(post({ token: changedToken() }), db, broken);
    expect(unavailable!.status).toBe(503);
    expect(await unavailable!.text()).not.toContain("Private rate-limiter details");
  });

  it("accepts same-origin and direct API creation while rejecting cross-origin posts", async () => {
    const blocked = await handleShareRequest(post({ token: changedToken() }, { Origin: "https://elsewhere.example" }), db);
    expect(blocked!.status).toBe(403);
    expect(db.count()).toBe(0);
    const sameOrigin = await handleShareRequest(post({ token: changedToken() }, { Origin: origin }), db);
    expect(sameOrigin!.status).toBe(200);
    expect((await handleShareRequest(post({ token: changedToken() }), db))!.status).toBe(200);
    expect(db.count()).toBe(1);
  });

  it("handles sharing before document rewrites and preserves existing legacy/static asset routes", async () => {
    const assets = { fetch: vi.fn(async (request: Request) => new Response(new URL(request.url).pathname)) };
    const created = await worker.fetch(post({ token: changedToken() }), { ASSETS: assets, SHARES: db });
    expect(created.status).toBe(200);
    expect(assets.fetch).not.toHaveBeenCalled();
    const legacy = await worker.fetch(new Request(`${origin}/AQE/fixed/slashes`, { headers: { Accept: "text/html" } }), { ASSETS: assets });
    expect(await legacy.text()).toBe("/");
    const image = await worker.fetch(new Request(`${origin}/social/rwc2027-card-v1.png`), { ASSETS: assets });
    expect(await image.text()).toBe("/social/rwc2027-card-v1.png");
    expect(await handleShareRequest(new Request(`${origin}/other`), db)).toBeUndefined();
  });
});
