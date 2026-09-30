import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import { decodeScenario, encodeScenario, validateScenario } from "./codec";
import { createScenarioController, emptyScenario } from "./controller";
import type { PredictionIntent, Scenario } from "../domain/types";

function frame(rawValue: unknown, overrides: { rawLength?: number; extraBytes?: number[] } = {}): string {
  const raw = strToU8(JSON.stringify(rawValue));
  const compressed = deflateSync(raw, { level: 6 });
  const declaredLength = overrides.rawLength ?? raw.length;
  const bytes = [declaredLength >> 8, declaredLength & 255, compressed.length >> 8, compressed.length & 255, ...compressed, ...(overrides.extraBytes ?? [])];
  return `v2.rwc2027.fixtures-2026-02.${btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}
const intent = fc.record({
  winner: fc.option(fc.constantFrom("home" as const, "away" as const, "draw" as const), { nil: undefined }),
  homeScore: fc.option(fc.integer({ min: 0, max: 255 }), { nil: undefined }),
  awayScore: fc.option(fc.integer({ min: 0, max: 255 }), { nil: undefined }),
  homeTries: fc.option(fc.integer({ min: 0, max: 15 }), { nil: undefined }),
  awayTries: fc.option(fc.integer({ min: 0, max: 15 }), { nil: undefined }),
  homeTryBonus: fc.option(fc.boolean(), { nil: undefined }),
  awayLosingBonus: fc.option(fc.boolean(), { nil: undefined }),
}).map((value) => {
  const present = Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
  return (Object.keys(present).length ? present : { winner: "home" }) as PredictionIntent;
});

export function fullScenario(): Scenario {
  const controller = createScenarioController();
  for (const fixture of controller.getState().derived.fixtures.filter((entry) => entry.stage === "pool")) controller.update(fixture.id, { winner: "home" });
  for (const fixture of controller.getState().derived.fixtures.filter((entry) => entry.stage !== "pool")) controller.update(fixture.id, { advancing: "home" });
  return controller.getState().scenario;
}

describe("Scenario URL replay", () => {
  it("round trips sparse explicit fields, zero/false choices, and all 52 IDs", () => {
    fc.assert(fc.property(fc.uniqueArray(fc.record({ id: fc.integer({ min: 1, max: 52 }), intent }), { selector: (row) => row.id, maxLength: 52 }), (rows) => {
      const scenario = { ...emptyScenario(), predictions: Object.fromEntries(rows.map((row) => [row.id, { intent: row.intent }])) };
      expect(decodeScenario(encodeScenario(scenario))).toEqual(scenario);
    }));
  });

  it("shares a completed 52-match scenario compactly, including replayed outcomes and participants", () => {
    const scenario = fullScenario();
    expect(Object.keys(scenario.predictions)).toHaveLength(52);
    expect(Object.keys(scenario.resolved!)).toHaveLength(52);
    const payload = encodeScenario(scenario);
    expect(payload).toMatch(/^v2\.rwc2027\.fixtures-2026-02\.[A-Za-z0-9_-]+$/);
    expect(payload.length).toBeLessThan(JSON.stringify(scenario).length / 2);
    expect(decodeScenario(payload)).toEqual(scenario);
  });

  it("replays saved inferred outcomes without substituting the current defaults", () => {
    const scenario = emptyScenario();
    scenario.predictions[1] = { intent: { winner: "home" } };
    scenario.resolved![1] = { homeScore: 81, awayScore: 80, homeTries: 11, awayTries: 11, winner: "home" };
    const controller = createScenarioController(decodeScenario(encodeScenario(scenario)));
    expect(controller.getState().derived.fixtures[0].result).toEqual(scenario.resolved![1]);
  });

  it("imports fixed ordinary-Base64 2023 links and the repaired v1 fragment without changing tournaments", () => {
    for (const link of ["CAEJChI=", "v1.rwc2023.fixtures-v1.AQEfCQoBAg"]) {
      const scenario = decodeScenario(link);
      expect(scenario.tournamentId).toBe("rwc2023");
      expect(scenario.predictions[1].intent).toEqual({ homeScore: 9, awayScore: 10, homeTries: 1, awayTries: 2 });
      expect(createScenarioController(scenario).getState().derived.fixtures[0].result?.winner).toBe("away");
      expect(decodeScenario(encodeScenario(createScenarioController(scenario).getState().scenario)).tournamentId).toBe("rwc2023");
    }
    expect(decodeScenario("CQEBHxhCLSev").predictions[9].intent).toEqual({ homeScore: 45, awayScore: 39, homeTries: 10, awayTries: 15 });
    expect(decodeScenario("AQH///8=").predictions[1].intent).toEqual({ homeScore: 255, awayScore: 255, homeTries: 15, awayTries: 15 });
  });

  it.each([
    ["provisional-v1", "defaults-v1", [[1, 1, ["home"], null, [0, 100, 0, 0, "away", null]]]],
    ["provisional-v1", "defaults-v1", [[1, 4, [7], null, [24, 10, 3, 1, "home", null]]]],
    ["provisional-v1", "defaults-v1", [[1, 128, [true], null, [24, 10, 3, 1, "home", null]]]],
    ["provisional-v1", "defaults-v1", [[1, 1024, [true], null, [24, 10, 3, 1, "home", null]]]],
    ["provisional-v1", "defaults-v1", [[1, 8, [24], null, [23, 10, 3, 1, "home", null]]]],
  ].map((raw) => ({ raw })))("rejects pinned outcomes that contradict explicit winner, margin, bonuses, or scores (%j)", ({ raw }) => {
    expect(() => decodeScenario(frame(raw))).toThrow(/Saved/);
  });

  it.each([
    ["different-rules", "defaults-v1", []],
    ["provisional-v1", "future-defaults", []],
    ["provisional-v1", "defaults-v1", [[53, 1, ["home"], null, null]]],
    ["provisional-v1", "defaults-v1", [[1, 1, ["home"], null, null], [1, 1, ["away"], null, null]]],
    ["provisional-v1", "defaults-v1", [[1, 4096, [true], null, null]]],
    ["provisional-v1", "defaults-v1", [[1, 8, ["24"], null, null]]],
    ["provisional-v1", "defaults-v1", [[1, 128, [1], null, null]]],
    ["provisional-v1", "defaults-v1", [[1, 1, ["home", "extra"], null, null]]],
    ["provisional-v1", "defaults-v1", [[1, 1, ["home"], ["unknown", "nz"], null]]],
    ["provisional-v1", "defaults-v1", [[1, 1, ["home"], null, [24, 17, 3, 2, "away", null]]]],
  ].map((raw) => ({ raw })))("rejects invalid versions, IDs, fields, participants, and result types (%j)", ({ raw }) => {
    expect(() => decodeScenario(frame(raw))).toThrow();
  });

  it("rejects a known wrong participant binding instead of silently clearing the imported pick", () => {
    const scenario = fullScenario();
    const payload = encodeScenario(scenario);
    const encodedFrame = payload.split(".")[3];
    const binary = Uint8Array.from(atob(encodedFrame.replace(/-/g, "+").replace(/_/g, "/")), (character) => character.charCodeAt(0));
    const packed = JSON.parse(strFromU8(inflateSync(binary.subarray(4)))) as [string, string, unknown[][]];
    const knockout = packed[2].find((row) => Array.isArray(row[3]))!;
    const participants = knockout[3] as string[];
    knockout[3] = [participants[0] === "nz" || participants[1] === "nz" ? "za" : "nz", participants[1]];
    // Ensure the replacement is a real tournament team, distinct from both original participants.
    if ((knockout[3] as string[])[0] === participants[1]) knockout[3] = ["ar", participants[1]];
    expect(() => decodeScenario(frame(packed))).toThrow(/participants disagree/);
    const bad = structuredClone(scenario);
    bad.predictions[Number(knockout[0])].participants = knockout[3] as [string, string];
    expect(() => createScenarioController(bad)).toThrow(/participants disagree/);
  });

  it("allows dormant participant bindings while pool conflicts leave teams unresolved", () => {
    const controller = createScenarioController(fullScenario());
    controller.update(1, { winner: "home", homeScore: 0, awayScore: 10 });
    const scenario = controller.getState().scenario;
    expect(controller.getState().derived.poolsComplete).toBe(false);
    const replayed = decodeScenario(encodeScenario(scenario));
    expect(replayed).toEqual(scenario);
    expect(Object.values(replayed.predictions).some((prediction) => prediction.participants)).toBe(true);
  });

  it("caps both compressed transport and decompressed length before processing", () => {
    const valid = ["provisional-v1", "defaults-v1", []];
    expect(() => decodeScenario(frame(valid, { rawLength: 65535 }))).toThrow();
    expect(() => decodeScenario(frame(valid, { rawLength: 1 }))).toThrow();
    expect(() => decodeScenario(frame(valid, { extraBytes: [1] }))).toThrow();
    expect(() => decodeScenario(`v2.rwc2027.fixtures-2026-02.${"A".repeat(20000)}`)).toThrow();
  });

  it.each(["v3.rwc2027.fixtures-2026-02.AAAA", "v2.foreign.fixtures-2026-02.AAAA", "v2.rwc2027.wrong.AAAA", "v2.rwc2027.fixtures-2026-02.!", "v2.rwc2027.fixtures-2026-02.A"])("recovers clearly from malformed or foreign transport (%s)", (payload) => {
    expect(() => decodeScenario(payload)).toThrow();
  });

  it("rejects unknown object fields and orphaned resolved outcomes", () => {
    expect(() => validateScenario({ ...emptyScenario(), surprise: true })).toThrow();
    expect(() => validateScenario({ ...emptyScenario(), predictions: { 1: { intent: { homeScore: "24" } } } })).toThrow();
    expect(() => validateScenario({ ...emptyScenario(), resolved: { 1: { homeScore: 24, awayScore: 17, homeTries: 3, awayTries: 2, winner: "home" } } })).toThrow();
  });
});
