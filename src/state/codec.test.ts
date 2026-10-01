import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { deflateSync, strToU8 } from "fflate";
import { decodeScenario, encodeScenario, validateScenario } from "./codec";
import { createScenarioController, emptyScenario } from "./controller";
import type { CompletionVersion, PredictionIntent, Scenario } from "../domain/types";
import { intentFields } from "../domain/completion";

const originalV2 = "v2.rwc2027.fixtures-2026-02.AE4ARItWKijKL8sszszPS8zRLTNU0lFKSU1LLM0pKQbzoqMNdQx1opUy8nNTlWJ18kpzcnSijUx0DM11jHWMdCDiYOFYIAAA";
function compactFrame(...fields: [number, number][]): string {
  const bits = fields.map(([value, width]) => value.toString(2).padStart(width, "0")).join("");
  const padded = bits.padEnd(Math.ceil(bits.length / 8) * 8, "0");
  const bytes = padded.match(/.{8}/g)?.map((byte) => parseInt(byte, 2)) ?? [];
  return compactBytes(bytes);
}
function compactBytes(bytes: number[]): string {
  return `v3.${btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

function frame(rawValue: unknown, overrides: { rawLength?: number; extraBytes?: number[] } = {}): string {
  const raw = strToU8(JSON.stringify(rawValue));
  const compressed = deflateSync(raw, { level: 6 });
  const declaredLength = overrides.rawLength ?? raw.length;
  const bytes = [declaredLength >> 8, declaredLength & 255, compressed.length >> 8, compressed.length & 255, ...compressed, ...(overrides.extraBytes ?? [])];
  return `v2.rwc2027.fixtures-2026-02.${btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}
const intent = fc.record({
  winner: fc.option(fc.constantFrom("home" as const, "away" as const, "draw" as const), { nil: undefined }),
  advancing: fc.option(fc.constantFrom("home" as const, "away" as const), { nil: undefined }),
  margin: fc.option(fc.integer({ min: 0, max: 255 }), { nil: undefined }),
  homeScore: fc.option(fc.integer({ min: 0, max: 255 }), { nil: undefined }),
  awayScore: fc.option(fc.integer({ min: 0, max: 255 }), { nil: undefined }),
  homeTries: fc.option(fc.integer({ min: 0, max: 15 }), { nil: undefined }),
  awayTries: fc.option(fc.integer({ min: 0, max: 15 }), { nil: undefined }),
  homeTryBonus: fc.option(fc.boolean(), { nil: undefined }),
  awayTryBonus: fc.option(fc.boolean(), { nil: undefined }),
  homeLosingBonus: fc.option(fc.boolean(), { nil: undefined }),
  awayLosingBonus: fc.option(fc.boolean(), { nil: undefined }),
}).map((value) => {
  const present = Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
  return (Object.keys(present).length ? present : { winner: "home" }) as PredictionIntent;
});

export function fullScenario(completionVersion: CompletionVersion = "rankings-v1"): Scenario {
  const controller = createScenarioController(emptyScenario("rwc2027", completionVersion));
  for (const fixture of controller.getState().derived.fixtures.filter((entry) => entry.stage === "pool")) controller.update(fixture.id, { winner: "home" });
  for (const fixture of controller.getState().derived.fixtures.filter((entry) => entry.stage !== "pool")) controller.update(fixture.id, { advancing: "home" });
  return controller.getState().scenario;
}

describe("Scenario URL replay", () => {
  it("keeps empty and winner-only links sparse and fixes their versioned default outcomes", () => {
    expect(encodeScenario(emptyScenario("rwc2027", "defaults-v1"))).toBe("v3.AYA");
    expect(encodeScenario(emptyScenario("rwc2023", "defaults-v1"))).toBe("v3.AoA");
    const controller = createScenarioController(emptyScenario("rwc2027", "defaults-v1"));
    controller.update(1, { winner: "home" });
    expect(encodeScenario(controller.getState().scenario)).toBe("v3.AYIKQA");
    const decoded = decodeScenario("v3.AYIKQA");
    expect(decoded.predictions).toEqual({ 1: { intent: { winner: "home" } } });
    expect(decoded.resolved).toEqual({ 1: { homeScore: 24, awayScore: 17, homeTries: 3, awayTries: 2, winner: "home" } });
    decoded.resolved![1].homeScore = 99;
    expect(decodeScenario("v3.AYIKQA").resolved![1].homeScore).toBe(24);
    controller.update(1, { margin: 15, homeTryBonus: true });
    expect(encodeScenario(controller.getState().scenario).length).toBeLessThanOrEqual(11);
    const pools = createScenarioController(emptyScenario("rwc2027", "defaults-v1"));
    for (let id = 1; id <= 36; id++) pools.update(id, { winner: "home" });
    expect(encodeScenario(pools.getState().scenario).length).toBeLessThanOrEqual(73);
  });

  it("gives ranking suggestions their own immutable profiles without growing sparse links", () => {
    expect(encodeScenario(emptyScenario())).toBe("v3.A4A");
    expect(encodeScenario(emptyScenario("rwc2023"))).toBe("v3.BIA");
    const controller = createScenarioController();
    controller.update(1, { winner: "home" });
    const token = encodeScenario(controller.getState().scenario);
    expect(token).toBe("v3.A4IKQA");
    expect(token.length).toBeLessThanOrEqual(9);
    const decoded = decodeScenario(token);
    expect(decoded.completionVersion).toBe("rankings-v1");
    expect(decoded.resolved![1]).toEqual({ homeScore: 58, awayScore: 8, homeTries: 8, awayTries: 1, winner: "home" });
    expect(decodeScenario("v3.AYIKQA").resolved![1].homeScore).toBe(24);
    controller.update(1, { margin: 15, homeTryBonus: true });
    expect(encodeScenario(controller.getState().scenario).length).toBeLessThanOrEqual(11);
    const pools = createScenarioController();
    for (let id = 1; id <= 36; id++) pools.update(id, { winner: "home" });
    expect(encodeScenario(pools.getState().scenario).length).toBeLessThanOrEqual(73);
    const ranked = createScenarioController();
    ranked.fillFromRankings();
    expect(encodeScenario(ranked.getState().scenario).length).toBeLessThanOrEqual(129);
    expect(decodeScenario(encodeScenario(ranked.getState().scenario))).toEqual(ranked.getState().scenario);
    const legacy = createScenarioController(emptyScenario("rwc2023"));
    legacy.update(1, { winner: "home" });
    expect(encodeScenario(legacy.getState().scenario)).toBe("v3.BIIKQA");
    expect(decodeScenario("v3.BIIKQA")).toEqual(legacy.getState().scenario);
    legacy.fillFromRankings();
    expect(decodeScenario(encodeScenario(legacy.getState().scenario))).toEqual(legacy.getState().scenario);
    expect(Object.keys(legacy.getState().scenario.resolved!)).toHaveLength(48);
  });

  it("preserves absent versus empty saved outcomes and every explicit zero/false or maximum field", () => {
    for (const numeric of [0, 255]) {
      const scenario = emptyScenario();
      scenario.predictions[52] = { intent: {
        winner: "draw", advancing: "away", margin: numeric, homeScore: numeric, awayScore: numeric,
        homeTries: numeric ? 15 : 0, awayTries: numeric ? 15 : 0,
        homeTryBonus: Boolean(numeric), awayTryBonus: false, homeLosingBonus: false, awayLosingBonus: Boolean(numeric),
      } };
      expect(decodeScenario(encodeScenario(scenario))).toEqual(scenario);
      delete scenario.resolved;
      expect(decodeScenario(encodeScenario(scenario))).toEqual(scenario);
      expect(decodeScenario(encodeScenario(scenario))).not.toHaveProperty("resolved");
    }
  });

  it("reads a fixed original v2 link and upgrades its completed values losslessly", () => {
    const scenario = decodeScenario(originalV2);
    expect(scenario.predictions).toEqual({ 1: { intent: { winner: "home" } } });
    expect(scenario.resolved).toEqual({ 1: { homeScore: 24, awayScore: 17, homeTries: 3, awayTries: 2, winner: "home" } });
    expect(encodeScenario(scenario)).toBe("v3.AYIKQA");
    expect(decodeScenario(encodeScenario(scenario))).toEqual(scenario);
  });

  it("round trips sparse explicit fields, zero/false choices, and all 52 IDs", () => {
    fc.assert(fc.property(fc.uniqueArray(fc.record({ id: fc.integer({ min: 1, max: 52 }), intent }), { selector: (row) => row.id, maxLength: 52 }), (rows) => {
      const scenario = { ...emptyScenario(), predictions: Object.fromEntries(rows.map((row) => [row.id, { intent: row.intent }])) };
      expect(decodeScenario(encodeScenario(scenario))).toEqual(scenario);
    }));
  });

  it.each(["defaults-v1", "rankings-v1"] as const)("shares a completed 52-match %s scenario compactly, including replayed outcomes and participants", (version) => {
    const scenario = fullScenario(version);
    expect(Object.keys(scenario.predictions)).toHaveLength(52);
    expect(Object.keys(scenario.resolved!)).toHaveLength(52);
    const payload = encodeScenario(scenario);
    expect(payload).toMatch(/^v3\.[A-Za-z0-9_-]+$/);
    expect(payload.length).toBeLessThanOrEqual(129);
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
    const bad = structuredClone(scenario);
    const participants = bad.predictions[37].participants!;
    const replacement = ["nz", "za", "ar"].find((team) => !participants.includes(team))!;
    bad.predictions[37].participants = [replacement, participants[1]];
    const rows = Object.entries(bad.predictions).map(([id, prediction]) => {
      const fields = intentFields.filter((field) => prediction.intent[field] !== undefined);
      const mask = fields.reduce((bits, field) => bits | (1 << intentFields.indexOf(field)), 0);
      const result = bad.resolved?.[Number(id)];
      return [Number(id), mask, fields.map((field) => prediction.intent[field]), prediction.participants ?? null, result ?
        [result.homeScore, result.awayScore, result.homeTries, result.awayTries, result.winner, result.advancing ?? null] : null];
    });
    expect(() => decodeScenario(frame([bad.rulesVersion, bad.completionVersion, rows]))).toThrow(/participants disagree/);
    expect(() => encodeScenario(bad)).toThrow(/participants disagree/);
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

  it("restores dormant knockout defaults and distinct pinned overrides with their saved teams", () => {
    const scenario = structuredClone(fullScenario());
    scenario.resolved![37] = { homeScore: 81, awayScore: 80, homeTries: 11, awayTries: 11, winner: "home", advancing: "home" };
    const controller = createScenarioController(scenario);
    controller.update(1, { winner: "home", homeScore: 0, awayScore: 10 });
    const dormant = controller.getState().scenario;
    const restored = createScenarioController(decodeScenario(encodeScenario(dormant)));
    expect(restored.getState().scenario).toEqual(dormant);
    expect(restored.getState().derived.poolsComplete).toBe(false);
    restored.update(1, { homeScore: undefined, awayScore: undefined });
    expect(restored.getState().derived.poolsComplete).toBe(true);
    expect(restored.getState().derived.fixtures.find((fixture) => fixture.id === 37)?.result).toEqual(scenario.resolved![37]);
    expect(restored.getState().scenario.predictions[52]).toEqual(scenario.predictions[52]);
    expect(restored.getState().scenario.resolved![52]).toEqual(scenario.resolved![52]);
  });

  it.each([
    { name: "unknown profile", fields: [[255, 8], [1, 1], [0, 6]] },
    { name: "too many matches", fields: [[1, 8], [1, 1], [53, 6]] },
    { name: "zero ID", fields: [[1, 8], [1, 1], [1, 6], [0, 6]] },
    { name: "foreign ID", fields: [[1, 8], [1, 1], [1, 6], [53, 6]] },
    { name: "2027 ID in 2023", fields: [[2, 8], [1, 1], [1, 6], [49, 6]] },
    { name: "duplicate ID", fields: [[1, 8], [1, 1], [2, 6], [1, 6], [1, 2], [0, 1], [0, 2], [1, 6], [1, 2], [0, 1], [0, 2]] },
    { name: "out-of-order IDs", fields: [[1, 8], [1, 1], [2, 6], [2, 6], [1, 2], [0, 1], [0, 2], [1, 6], [1, 2], [0, 1], [0, 2]] },
    { name: "knockout draw shortcut", fields: [[1, 8], [1, 1], [1, 6], [37, 6], [3, 2], [0, 1], [0, 2]] },
    { name: "empty intent", fields: [[1, 8], [1, 1], [1, 6], [1, 6], [0, 2], [0, 11], [0, 1], [0, 2]] },
    { name: "reserved winner", fields: [[1, 8], [1, 1], [1, 6], [1, 6], [0, 2], [1, 11], [3, 2], [0, 1], [0, 2]] },
    { name: "unknown participant index", fields: [[1, 8], [1, 1], [1, 6], [37, 6], [1, 2], [1, 1], [31, 5], [0, 5], [0, 2]] },
    { name: "same participants", fields: [[1, 8], [1, 1], [1, 6], [37, 6], [1, 2], [1, 1], [0, 5], [0, 5], [0, 2]] },
    { name: "reserved result mode", fields: [[1, 8], [1, 1], [1, 6], [1, 6], [1, 2], [0, 1], [3, 2]] },
    { name: "saved result without result object", fields: [[1, 8], [0, 1], [1, 6], [1, 6], [1, 2], [0, 1], [1, 2]] },
    { name: "unbound knockout default", fields: [[1, 8], [1, 1], [1, 6], [37, 6], [1, 2], [0, 1], [1, 2]] },
    { name: "reserved advancement", fields: [[1, 8], [1, 1], [1, 6], [37, 6], [1, 2], [1, 1], [0, 5], [1, 5], [2, 2], [24, 8], [17, 8], [3, 4], [2, 4], [3, 2]] },
    { name: "pinned result contradicts winner", fields: [[1, 8], [1, 1], [1, 6], [1, 6], [1, 2], [0, 1], [2, 2], [17, 8], [24, 8], [2, 4], [3, 4], [0, 2]] },
  ])("rejects malformed compact bits: $name", ({ fields }) => {
    expect(() => decodeScenario(compactFrame(...fields as [number, number][]))).toThrow();
  });

  it("rejects truncated frames, nonzero padding, extra bytes, and noncanonical Base64", () => {
    const encoded = encodeScenario(fullScenario()).slice(3);
    const bytes = Array.from(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")), (character) => character.charCodeAt(0));
    for (let length = 0; length < bytes.length; length++) expect(() => decodeScenario(compactBytes(bytes.slice(0, length)))).toThrow();
    for (const payload of [compactBytes([1, 130, 10, 65]), compactBytes([1, 130, 10, 64, 0]), "v3.AYIKQA=", "v3.AYIKQB", "v3.AQ", `v3.${"A".repeat(20000)}`]) {
      expect(() => decodeScenario(payload)).toThrow();
    }
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
