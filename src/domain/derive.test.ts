import { describe, expect, it } from "vitest";
import { deriveScenario } from "./derive";
import { thirdPlaceAssignments } from "./third-place";
import { defaultTournament, getTournament } from "./tournaments";
import type { PredictionIntent, Scenario, Tournament } from "./types";

function emptyScenario(tournament: Tournament = defaultTournament): Scenario {
  return {
    schemaVersion: 2, tournamentId: tournament.id, datasetVersion: tournament.datasetVersion,
    rulesVersion: tournament.rulesVersion, completionVersion: "defaults-v1", predictions: {},
  };
}

function completePools(thirds = ["A", "B", "C", "D"]): Scenario {
  const scenario = emptyScenario();
  for (const fixture of defaultTournament.fixtures.filter((fixture) => fixture.stage === "pool")) {
    if (fixture.home.kind !== "team" || fixture.away.kind !== "team") throw new Error("Expected teams");
    const pool = defaultTournament.pools.find((pool) => pool.id === fixture.pool)!;
    const homeRank = pool.teamIds.indexOf(fixture.home.teamId);
    const awayRank = pool.teamIds.indexOf(fixture.away.teamId);
    const winner = homeRank < awayRank ? "home" : "away";
    const thirdWins = Math.min(homeRank, awayRank) === 2;
    const score = thirdWins ? thirds.includes(pool.id) ? 28 : 14 : 30;
    const losingScore = thirdWins ? 0 : 10;
    const tries = thirdWins ? thirds.includes(pool.id) ? 4 : 2 : 4;
    const losingTries = thirdWins ? 0 : 1;
    const intent: PredictionIntent = winner === "home"
      ? { winner, homeScore: score, awayScore: losingScore, homeTries: tries, awayTries: losingTries }
      : { winner, homeScore: losingScore, awayScore: score, homeTries: losingTries, awayTries: tries };
    scenario.predictions[fixture.id] = { intent };
  }
  return scenario;
}

const officialRows: [string, string[]][] = [
  ["ABCD", ["C", "D", "A", "B"]], ["ABCE", ["C", "E", "A", "B"]],
  ["ABCF", ["C", "F", "A", "B"]], ["ABDE", ["E", "D", "A", "B"]],
  ["ABDF", ["F", "D", "A", "B"]], ["ABEF", ["E", "F", "A", "B"]],
  ["ACDE", ["C", "D", "A", "E"]], ["ACDF", ["C", "D", "A", "F"]],
  ["ACEF", ["C", "E", "A", "F"]], ["ADEF", ["E", "D", "A", "F"]],
  ["BCDE", ["C", "D", "E", "B"]], ["BCDF", ["C", "D", "F", "B"]],
  ["BCEF", ["C", "E", "F", "B"]], ["BDEF", ["E", "D", "F", "B"]],
  ["CDEF", ["C", "D", "E", "F"]],
];

describe("qualification and bracket derivation", () => {
  it("shows every team at zero and waits for the pool predictions", () => {
    const derived = deriveScenario(emptyScenario());
    expect(derived.poolsComplete).toBe(false);
    expect(derived.qualifiedThirdPools).toEqual([]);
    expect(Object.values(derived.standings).flat()).toHaveLength(24);
    expect(Object.values(derived.standings).flat().every((row) => row.played === 0 && row.points === 0)).toBe(true);
    expect(derived.fixtures.filter((fixture) => fixture.stage !== "pool").every((fixture) => !fixture.homeTeam && !fixture.awayTeam)).toBe(true);
  });

  it.each(officialRows)("uses official third-place allocation for %s after calculating all six pools", (key, opponents) => {
    const derived = deriveScenario(completePools(key.split("")));
    expect(derived.poolsComplete).toBe(true);
    expect([...derived.qualifiedThirdPools].sort().join("")).toBe(key);
    const assignments = thirdPlaceAssignments([...key].reverse())!;
    expect([assignments.A, assignments.B, assignments.C, assignments.D]).toEqual(opponents);
    const thirdMatches = [38, 40, 41, 42].map((id) => derived.fixtures.find((fixture) => fixture.id === id)!);
    expect(thirdMatches.map((fixture) => fixture.awayTeam?.id)).toEqual(opponents.map((pool) => derived.standings[pool][2].teamId));
    const firstRound = derived.fixtures.filter((fixture) => fixture.stage === "round16");
    expect(new Set(firstRound.flatMap((fixture) => [fixture.homeTeam?.id, fixture.awayTeam?.id])).size).toBe(16);
    for (const fixture of firstRound) {
      const homePool = defaultTournament.pools.find((pool) => pool.teamIds.includes(fixture.homeTeam!.id));
      const awayPool = defaultTournament.pools.find((pool) => pool.teamIds.includes(fixture.awayTeam!.id));
      expect(homePool?.id).not.toBe(awayPool?.id);
    }
  });

  it("rejects invalid qualifying combinations", () => {
    expect(thirdPlaceAssignments(["A", "A", "B", "C"])).toBeUndefined();
    expect(thirdPlaceAssignments(["A", "B", "C"])).toBeUndefined();
    expect(thirdPlaceAssignments(["A", "B", "C", "G"])).toBeUndefined();
  });

  it("breaks fully tied third-place qualification with the labelled ranking snapshot", () => {
    const derived = deriveScenario(completePools(["A", "B", "C", "D", "E", "F"]));
    const thirds = defaultTournament.pools.map((pool) => derived.standings[pool.id][2]);
    expect(new Set(thirds.map((row) => [row.points, row.pointsFor - row.pointsAgainst, row.pointsFor, row.triesFor].join("/"))).size).toBe(1);
    // Verified 1 December 2025 rankings: Georgia 13, Uruguay 14, Spain 15, USA 16.
    expect(derived.qualifiedThirdPools).toEqual(["B", "D", "C", "E"]);
    expect(derived.fixtures[37].awayTeam?.id).toBe("es");
    expect(derived.fixtures[39].awayTeam?.id).toBe("uy");
    expect(derived.fixtures[40].awayTeam?.id).toBe("us");
    expect(derived.fixtures[41].awayTeam?.id).toBe("ge");
  });

  it("does not qualify a third-place team from a partially completed pool phase", () => {
    const scenario = completePools();
    delete scenario.predictions[36];
    const derived = deriveScenario(scenario);
    expect(derived.standings.A.every((row) => row.played === 3)).toBe(true);
    expect(derived.poolsComplete).toBe(false);
    expect(derived.qualifiedThirdPools).toEqual([]);
    expect(derived.fixtures.filter((fixture) => fixture.stage === "round16").every((fixture) => !fixture.homeTeam && !fixture.awayTeam)).toBe(true);
  });

  it("resolves every knockout dependency, including semi-final losers in bronze", () => {
    const scenario = completePools();
    for (const fixture of defaultTournament.fixtures.filter((fixture) => fixture.stage !== "pool")) {
      const current = deriveScenario(scenario).fixtures.find((item) => item.id === fixture.id)!;
      expect(current.homeTeam).toBeDefined();
      expect(current.awayTeam).toBeDefined();
      scenario.predictions[fixture.id] = { intent: { winner: "home" }, participants: [current.homeTeam!.id, current.awayTeam!.id] };
    }
    const derived = deriveScenario(scenario);
    expect(derived.fixtures.every((fixture) => fixture.result && fixture.issues.length === 0)).toBe(true);
    const sf1 = derived.fixtures.find((fixture) => fixture.id === 49)!;
    const sf2 = derived.fixtures.find((fixture) => fixture.id === 50)!;
    expect(derived.fixtures[50].homeTeam?.id).toBe(sf1.awayTeam?.id);
    expect(derived.fixtures[50].awayTeam?.id).toBe(sf2.awayTeam?.id);
    expect(derived.fixtures[51].homeTeam?.id).toBe(sf1.homeTeam?.id);
    expect(derived.fixtures[51].awayTeam?.id).toBe(sf2.homeTeam?.id);
  });

  it("allows a regulation draw with a separate knockout advancing team", () => {
    const scenario = completePools();
    scenario.predictions[38] = { intent: { winner: "draw", advancing: "away", homeScore: 21, awayScore: 21 } };
    const derived = deriveScenario(scenario);
    expect(derived.fixtures[37].result).toMatchObject({ winner: "draw", advancing: "away" });
    expect(derived.fixtures[44].homeTeam?.id).toBe(derived.fixtures[37].awayTeam?.id);
  });

  it("holds knockout dependencies for a draw without an advancing choice", () => {
    const scenario = completePools();
    scenario.predictions[38] = { intent: { winner: "draw", homeScore: 21, awayScore: 21 } };
    const derived = deriveScenario(scenario);
    expect(derived.fixtures[44].homeTeam).toBeUndefined();
  });

  it("does not apply a knockout choice to changed participants or carry it downstream", () => {
    const scenario = completePools();
    const before = deriveScenario(scenario).fixtures[37];
    scenario.predictions[38] = { intent: { winner: "home" }, participants: [before.homeTeam!.id, before.awayTeam!.id] };
    scenario.predictions[16] = { intent: { winner: "away", homeScore: 10, awayScore: 30, homeTries: 1, awayTries: 4 } };
    const after = deriveScenario(scenario);
    expect(after.fixtures[37].homeTeam?.id).not.toBe(before.homeTeam?.id);
    expect(after.fixtures[37].result).toBeUndefined();
    expect(after.fixtures[37].issues[0]).toContain("teams");
    expect(after.fixtures[44].homeTeam).toBeUndefined();
  });

  it("keeps conflicting explicit scores visible while excluding that fixture from standings and qualification", () => {
    const scenario = completePools();
    scenario.predictions[1] = { intent: { winner: "away", homeScore: 30, awayScore: 10, homeTries: 4, awayTries: 1 } };
    const derived = deriveScenario(scenario);
    expect(derived.fixtures[0].result).toMatchObject({ homeScore: 30, awayScore: 10 });
    expect(derived.fixtures[0].issues.length).toBeGreaterThan(0);
    expect(derived.standings.A.find((row) => row.teamId === "au")?.played).toBe(2);
    expect(derived.poolsComplete).toBe(false);
    expect(derived.fixtures[37].homeTeam).toBeUndefined();
  });

  it("keeps saved completed values reproducible and derives totals from them", () => {
    const scenario = emptyScenario();
    scenario.predictions[1] = { intent: { winner: "home" } };
    scenario.resolved = { 1: { homeScore: 35, awayScore: 7, homeTries: 5, awayTries: 1, winner: "home" } };
    const derived = deriveScenario(scenario);
    expect(derived.fixtures[0].result?.homeScore).toBe(35);
    expect(derived.standings.A.find((row) => row.teamId === "au")?.points).toBe(5);
  });

  it("validates conflicts against the saved outcome used for replay", () => {
    const scenario = emptyScenario();
    scenario.predictions[1] = { intent: { winner: "home" } };
    scenario.resolved = { 1: { homeScore: 7, awayScore: 35, homeTries: 1, awayTries: 5, winner: "away" } };
    const derived = deriveScenario(scenario);
    expect(derived.fixtures[0].result?.winner).toBe("away");
    expect(derived.fixtures[0].issues).toContain("The chosen winner conflicts with the scores.");
    expect(derived.standings.A.every((row) => row.played === 0)).toBe(true);
  });

  it("rejects unknown rules or dataset versions", () => {
    expect(() => deriveScenario({ ...emptyScenario(), rulesVersion: "unknown" })).toThrow("unsupported");
    expect(() => deriveScenario({ ...emptyScenario(), datasetVersion: "unknown" })).toThrow("unsupported");
  });

  it("keeps a legacy France prediction in 2023", () => {
    const scenario = emptyScenario(getTournament("rwc2023"));
    scenario.predictions[1] = { intent: { winner: "home" } };
    const derived = deriveScenario(scenario);
    expect(derived.fixtures[0].homeTeam?.id).toBe("fr");
    expect(derived.standings.A.find((row) => row.teamId === "fr")?.wins).toBe(1);
    expect(derived.fixtures).toHaveLength(48);
  });
});
