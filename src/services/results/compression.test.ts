import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { encode, decode, CURRENT_LINK_IDENTITY } from "./compression";
import type { MatchNumber } from "../../data/fixtures";
import { type Result, type ResultData, type CompleteResult } from "./model";

const completeData = fc.record({
  touched: fc.constant(true as const),
  homeScore: fc.integer({ min: 0, max: 255 }),
  awayScore: fc.integer({ min: 0, max: 255 }),
  homeTries: fc.integer({ min: 0, max: 15 }),
  awayTries: fc.integer({ min: 0, max: 15 }),
});
const partialData = fc.record({
  touched: fc.constant(true as const),
  homeScore: fc.option(fc.integer({ min: 0, max: 255 }), { nil: undefined }),
  awayScore: fc.option(fc.integer({ min: 0, max: 255 }), { nil: undefined }),
  homeTries: fc.option(fc.integer({ min: 0, max: 15 }), { nil: undefined }),
  awayTries: fc.option(fc.integer({ min: 0, max: 15 }), { nil: undefined }),
}).map((data) => Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) as ResultData);
const pristineData = fc.constant({ touched: false as const });

function numbered(data: ResultData[]): Result[] {
  return data.map((result, index) => ({ ...result, matchNumber: (index + 1) as MatchNumber }));
}

function base64(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes));
}
function currentPayload(bytes: number[]): string {
  return `v1.rwc2023.fixtures-v1.${base64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}
function legacyEncode(results: Result[]): string {
  const bitmap = new Array<number>(Math.ceil(results.length / 8)).fill(0);
  const values: number[] = [];
  results.forEach((result, index) => {
    if (!result.touched) return;
    bitmap[Math.floor(index / 8)] |= 1 << (index % 8);
    const complete = result as CompleteResult;
    values.push(complete.homeScore, complete.awayScore, (complete.homeTries << 4) | complete.awayTries);
  });
  return base64([results.length, ...bitmap, ...values]);
}

describe("Versioned prediction links", () => {
  it("round trips complete, partial, pristine, and empty predictions", () => {
    fc.assert(fc.property(fc.array(fc.oneof(pristineData, completeData, partialData), { maxLength: 52 }), (data) => {
      const results = numbered(data);
      const identity = { tournament: "codec-test", dataset: "bytes-v1" };
      expect(decode(encode(results, identity), identity)).toEqual(results);
    }));
  });

  it("preserves sparse explicit IDs, empty touched edits, cleared fields, and numeric zero", () => {
    const results: Result[] = [
      { matchNumber: 48, touched: true, awayScore: 0, homeScore: 255, awayTries: 15 },
      { matchNumber: 2, touched: true, homeScore: undefined },
      { matchNumber: 7, touched: false },
    ];
    const payload = encode(results);
    expect(payload).toMatch(/^v1\.rwc2023\.fixtures-v1\.[A-Za-z0-9_-]+$/);
    expect(decode(payload)).toEqual([
      results[0], { matchNumber: 2, touched: true }, results[2],
    ]);
  });

  it("can pack 52 matches without assigning them to the active 2023 tournament", () => {
    // Generic byte packing is future-ready; the current storage/model boundary rejects IDs above 48.
    const results = numbered(Array.from({ length: 52 }, () => ({ touched: false })));
    const identity = { tournament: "rwc2027", dataset: "future-fixtures-test" };
    const payload = encode(results, identity);
    expect(decode(payload, identity)).toEqual(results);
    expect(() => decode(payload)).toThrow(/different tournament/);
  });

  it("rejects unsupported versions, tournaments, and datasets", () => {
    const payload = encode([]);
    expect(() => decode(payload.replace("v1.", "v2."))).toThrow(/unsupported version/);
    expect(() => decode(payload.replace("rwc2023", "rwc2027"))).toThrow(/different tournament/);
    expect(() => decode(payload.replace("fixtures-v1", "fixtures-v2"))).toThrow(/fixture dataset/);
  });

  it.each([-1, 256, 1.5, NaN, "32"])("rejects invalid scores (%s) before packing", (homeScore) => {
    expect(() => encode([{ matchNumber: 1, touched: true, homeScore } as Result])).toThrow();
  });

  it.each([-1, 16, 2.5, "4"])("rejects invalid tries (%s) before packing", (homeTries) => {
    expect(() => encode([{ matchNumber: 1, touched: true, homeTries } as Result])).toThrow();
  });

  it("rejects duplicate IDs and fields on pristine records", () => {
    expect(() => encode([{ matchNumber: 1, touched: false }, { matchNumber: 1, touched: true }])).toThrow();
    expect(() => encode([{ matchNumber: 1, touched: false, homeScore: 0 } as Result])).toThrow();
  });

  it.each([
    [], [1], [1, 0, 0], [1, 1, 1], [1, 1, 32], [1, 1, 17],
    [1, 1, 20, 16], [1, 1, 16, 0], [2, 1, 0, 1, 0],
  ].map((bytes) => ({ bytes })))("rejects truncated, extra, or invalid binary records (%j)", ({ bytes }) => {
    expect(() => decode(currentPayload(bytes))).toThrow();
  });

  it.each(["", "!", "AQ=Q", "AQ===", "v1.rwc2023.fixtures-v1.!", "v1.rwc2023.fixtures-v1.A", "v1.rwc2023.fixtures-v1.AB"])("rejects malformed Base64 (%s)", (payload) => {
    expect(() => decode(payload)).toThrow();
  });
});

describe("Legacy 2023 prediction links", () => {
  it("round trips all 1–48 match counts with the final partial bitmap byte", () => {
    fc.assert(fc.property(fc.array(fc.oneof(pristineData, completeData), { minLength: 1, maxLength: 48 }), (data) => {
      const results = numbered(data);
      expect(decode(legacyEncode(results))).toEqual(results);
    }));
  });

  it("decodes a fixed nine-match legacy payload and packed try nibbles", () => {
    const results = decode(base64([9, 1, 1, 31, 24, 0x42, 45, 39, 0xaf]));
    expect(results[0]).toEqual({ matchNumber: 1, touched: true, homeScore: 31, awayScore: 24, homeTries: 4, awayTries: 2 });
    expect(results[8]).toEqual({ matchNumber: 9, touched: true, homeScore: 45, awayScore: 39, homeTries: 10, awayTries: 15 });
  });

  it("does not reinterpret legacy records for another tournament or dataset", () => {
    const legacy = legacyEncode([{ matchNumber: 1, touched: false }]);
    expect(() => decode(legacy, { ...CURRENT_LINK_IDENTITY, tournament: "rwc2027" })).toThrow(/2023/);
    expect(() => decode(legacy, { ...CURRENT_LINK_IDENTITY, dataset: "fixtures-v2" })).toThrow(/2023/);
  });

  it.each([[0], [49, 0, 0, 0, 0, 0, 0, 0], [9, 0], [1, 2], [1, 1, 32], [1, 0, 0]].map((bytes) => ({ bytes })))("rejects invalid counts, bitmaps, missing values, and trailing bytes (%j)", ({ bytes }) => {
    expect(() => decode(base64(bytes))).toThrow();
  });
});
