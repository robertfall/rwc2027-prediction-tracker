/// <reference types="node" />

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeScenario, encodeScenario } from "../state/codec";
import { emptyScenario } from "../state/controller";
import type { SharingDatabase, SharingStatement } from "./store";
import { createSharedPoster, MAX_POSTER_PNG_BYTES, readSharedPoster, validatePosterPng } from "./poster-store";
import { SHARE_WORDS } from "./words";
import { png2023, png2027, pngChunk, posterAliasA, posterAliasB, posterInput, posterPng, seedPriorPoster, SqlitePosters } from "./poster-test-support";

describe("Immutable shared poster storage", () => {
  let db: SqlitePosters;
  beforeEach(() => { db = new SqlitePosters(); });
  afterEach(() => { db.close(); });

  it("stores exact PNG bytes, metadata and canonical predictions without changing their state", async () => {
    const input = posterInput();
    const saved = await createSharedPoster(db, input, () => posterAliasA);
    expect(saved.alias).toBe(posterAliasA);
    expect(saved.png).toEqual(new Uint8Array(Buffer.from(png2027, "base64")));
    expect(saved.pngHash).toMatch(/^[a-f0-9]{64}$/);
    expect(saved.width).toBe(1080);
    expect(saved.height).toBe(1808);
    expect(saved.token).toBe(input.token);
    expect(saved.teamId).toBe("za");
    expect(saved.showPredictions).toBe(true);
    expect(saved.timeZone).toBe("Africa/Johannesburg");
    expect(saved.imageUrl).toBe(`/i/${posterAliasA}.png`);
    expect(saved.pageUrl).toBe(`/p/${posterAliasA}`);
    expect(await readSharedPoster(db, posterAliasA)).toEqual(saved);
    expect(decodeScenario(saved.token).predictions[7].intent).toEqual({ winner: "home", margin: 15 });
    expect(input.token).toBe(saved.token);
  });

  it("deduplicates exact artifacts, retries occupied aliases and never updates either poster", async () => {
    const saved = await createSharedPoster(db, posterInput(), () => posterAliasA);
    expect(await createSharedPoster(db, posterInput(), () => { throw new Error("Must reuse alias"); })).toEqual(saved);
    let attempts = 0;
    const different = await createSharedPoster(db, posterInput({ png: posterPng(1808, 1) }), () => attempts++ === 0 ? posterAliasA : posterAliasB);
    expect(different.alias).toBe(posterAliasB);
    expect(different.pngHash).not.toBe(saved.pngHash);
    expect(attempts).toBe(2);
    expect(db.count()).toBe(2);
    expect(await readSharedPoster(db, posterAliasA)).toEqual(saved);
    expect(() => db.sqlite.prepare("UPDATE shared_posters SET team_id = ?1 WHERE alias = ?2").run("it", posterAliasA)).toThrow(/immutable/);
    expect(() => db.sqlite.prepare("UPDATE shared_snapshots SET token = token").run()).not.toThrow();
  });

  it("includes team, timezone, prediction visibility and token in identity and bounds collision retries", async () => {
    const first = await createSharedPoster(db, posterInput(), () => posterAliasA);
    for (const override of [{ teamId: "it" }, { timeZone: "UTC" }, { showPredictions: false }, { token: encodeScenario(emptyScenario()) }]) {
      let attempts = 0;
      await expect(createSharedPoster(db, posterInput(override), () => { attempts++; return posterAliasA; })).rejects.toThrow(/allocate/);
      expect(attempts).toBe(8);
    }
    expect(await readSharedPoster(db, posterAliasA)).toEqual(first);
    expect(db.count()).toBe(1);
  });

  it("deduplicates concurrent equal requests after each observes an empty database", async () => {
    const count = 12;
    const concurrent = new SqlitePosters(count);
    try {
      const results = await Promise.all(Array.from({ length: count }, (_, index) => createSharedPoster(
        concurrent, posterInput(), () => `${SHARE_WORDS[index]}.${SHARE_WORDS[1]}.${SHARE_WORDS[2]}`,
      )));
      expect(new Set(results.map((result) => result.alias)).size).toBe(1);
      expect(concurrent.count()).toBe(1);
    } finally { concurrent.close(); }
  });

  it("removes hidden picks and saved results before storage and preserves the same legacy tournament", async () => {
    const hidden = await createSharedPoster(db, posterInput({ showPredictions: false }), () => posterAliasA);
    expect(hidden.token).toBe(encodeScenario(emptyScenario()));
    expect(decodeScenario(hidden.token).predictions).toEqual({});
    const other = emptyScenario();
    other.predictions[1] = { intent: { winner: "away" } };
    expect(await createSharedPoster(db, posterInput({ token: encodeScenario(other), showPredictions: false }))).toEqual(hidden);
    const legacy = emptyScenario("rwc2023");
    legacy.predictions[1] = { intent: { winner: "away", homeScore: 3, awayScore: 8 } };
    const legacyHidden = await createSharedPoster(db, posterInput({ token: encodeScenario(legacy), png: png2023, showPredictions: false }), () => posterAliasB);
    expect(legacyHidden.token).toBe(encodeScenario(emptyScenario("rwc2023")));
    expect(legacyHidden.height).toBe(2216);
    expect(legacyHidden.png).toEqual(new Uint8Array(Buffer.from(png2023, "base64")));
    expect(db.count()).toBe(2);
  });

  it.each(["rwc2027", "rwc2023"] as const)("preserves earlier stored poster bytes but accepts only current dimensions for new %s uploads", async (tournamentId) => {
    const prior = seedPriorPoster(db, tournamentId);
    const saved = (await readSharedPoster(db, prior.alias))!;
    expect(saved.height).toBe(prior.height);
    expect(saved.png).toEqual(new Uint8Array(Buffer.from(prior.png, "base64")));
    expect(saved.pngHash).toBe(prior.pngHash);
    expect(saved.imageUrl).toBe(`/i/${prior.alias}.png`);
    await expect(createSharedPoster(db, posterInput({ token: prior.token, png: prior.png }))).rejects.toThrow(/valid pool poster PNG/);
    expect(db.count()).toBe(1);
    expect(await readSharedPoster(db, prior.alias)).toEqual(saved);
  });

  it.each([
    {}, [], null, { ...posterInput(), extra: true }, posterInput({ token: "v99.bogus" }),
    posterInput({ teamId: "na" }), posterInput({ teamId: "ZA" }), posterInput({ teamId: "//other.example" }),
    posterInput({ timeZone: "bad/zone" }), posterInput({ timeZone: "UTC\n" }), posterInput({ timeZone: 1 }),
    posterInput({ showPredictions: "false" }), posterInput({ rendererVersion: "pool-poster-v3" }),
  ])("rejects malformed fields before storage (case %#)", async (value) => {
    await expect(createSharedPoster(db, value)).rejects.toThrow();
    expect(db.count()).toBe(0);
  });

  it("rejects invalid aliases without querying and detects corrupt stored data", async () => {
    const prepare = vi.spyOn(db, "prepare");
    for (const alias of ["", "other.other.other", "../path", `${posterAliasA}/extra`]) expect(await readSharedPoster(db, alias)).toBeNull();
    expect(prepare).not.toHaveBeenCalled();
    const corrupt: SharingDatabase = {
      prepare: () => {
        const statement: SharingStatement = {
          bind: () => statement,
          first: async <T>() => ({ alias: posterAliasA, ...posterInput(), showPredictions: "false", pngHash: "a".repeat(64) }) as T,
          run: async () => ({ success: true }),
        };
        return statement;
      },
    };
    await expect(readSharedPoster(corrupt, posterAliasA)).rejects.toThrow(/Stored poster is invalid/);
  });
});

describe("Bounded poster PNG validation", () => {
  it("accepts the canvas-sized 2027 and 2023 envelopes and exact bytes", () => {
    expect(validatePosterPng(png2027, "rwc2027").height).toBe(1808);
    expect(validatePosterPng(png2023, "rwc2023").height).toBe(2216);
    expect(validatePosterPng(png2027, "rwc2027").bytes).toEqual(new Uint8Array(Buffer.from(png2027, "base64")));
  });

  it("allows prior dimensions only through the stored-read option and still rejects arbitrary dimensions", () => {
    for (const [tournamentId, height] of [["rwc2027", 1536], ["rwc2023", 1850]] as const) {
      const image = posterPng(height);
      expect(() => validatePosterPng(image, tournamentId)).toThrow(/valid pool poster PNG/);
      expect(validatePosterPng(image, tournamentId, { allowPriorDimensions: true }).height).toBe(height);
      expect(() => validatePosterPng(posterPng(height + 1), tournamentId, { allowPriorDimensions: true })).toThrow(/valid pool poster PNG/);
    }
  });

  it.each(["", "abc", "____", `${png2027}\n`, `data:image/png;base64,${png2027}`, null, 1])("rejects noncanonical base64 (case %#)", (value) => {
    expect(() => validatePosterPng(value, "rwc2027")).toThrow(/valid pool poster PNG/);
  });

  it("rejects wrong sizes, corrupt CRCs, missing IEND, extra bytes and impossible chunk lengths", () => {
    expect(() => validatePosterPng(png2023, "rwc2027")).toThrow();
    expect(() => validatePosterPng(posterPng(1808, 0, 1079), "rwc2027")).toThrow();
    const bytes = Buffer.from(png2027, "base64");
    const corrupt = Buffer.from(bytes);
    corrupt[29] ^= 1;
    const badLength = Buffer.from(bytes);
    badLength.writeUInt32BE(0xffffffff, 33);
    for (const image of [corrupt, bytes.subarray(0, -12), Buffer.concat([bytes, Buffer.from([0])]), badLength]) {
      expect(() => validatePosterPng(image.toString("base64"), "rwc2027")).toThrow(/valid pool poster PNG/);
    }
  });

  it("rejects animation chunks and unknown critical chunks even with correct CRCs", () => {
    const bytes = Buffer.from(png2027, "base64");
    for (const type of ["acTL", "fcTL", "fdAT", "TEST"]) {
      const image = Buffer.concat([bytes.subarray(0, 33), pngChunk(type, new Uint8Array(8)), bytes.subarray(33)]);
      expect(() => validatePosterPng(image.toString("base64"), "rwc2027")).toThrow(/valid pool poster PNG/);
    }
  });

  it("bounds encoded and decoded images before chunk processing", () => {
    const tooLarge = Buffer.alloc(MAX_POSTER_PNG_BYTES + 1).toString("base64");
    expect(() => validatePosterPng(tooLarge, "rwc2027")).toThrow(/too large/);
  });
});
