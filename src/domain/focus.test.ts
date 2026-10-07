import { describe, expect, it } from "vitest";
import { deriveScenario } from "./derive";
import { deriveTeamFocus } from "./focus";
import { planRankingFill } from "./ranking-fill";
import { getTournament } from "./tournaments";
import type { DerivedScenario, PredictionIntent, Scenario, Tournament } from "./types";

function blank(tournamentId: Tournament["id"] = "rwc2027"): Scenario {
  const tournament = getTournament(tournamentId);
  return { schemaVersion: 2, tournamentId, datasetVersion: tournament.datasetVersion,
    rulesVersion: tournament.rulesVersion, completionVersion: "defaults-v1", predictions: {}, resolved: {} };
}

function filled(tournamentId: Tournament["id"] = "rwc2027"): Scenario {
  const scenario = blank(tournamentId);
  for (const update of planRankingFill(scenario).updates) {
    scenario.predictions[update.fixtureId] = { intent: update.intent,
      ...(update.participants ? { participants: update.participants } : {}) };
    scenario.resolved![update.fixtureId] = update.result;
  }
  return scenario;
}

function change(scenario: Scenario, fixtureId: number, intent?: PredictionIntent): Scenario {
  const next = structuredClone(scenario);
  if (intent) next.predictions[fixtureId] = { intent };
  else delete next.predictions[fixtureId];
  delete next.resolved?.[fixtureId];
  return next;
}

function knockouts(derived: DerivedScenario, teamId: string): number[] {
  const focused = deriveTeamFocus(derived, teamId);
  return derived.fixtures.filter((fixture) => fixture.stage !== "pool" && focused.fixtureIds.has(fixture.id)).map((fixture) => fixture.id);
}

describe("team Focus view filtering", () => {
  it("shows all fixtures and pools when no valid focus is selected", () => {
    const derived = deriveScenario(blank());
    for (const teamId of [undefined, "", "unknown", "na"]) {
      const focused = deriveTeamFocus(derived, teamId);
      expect([...focused.fixtureIds]).toEqual(derived.fixtures.map((fixture) => fixture.id));
      expect([...focused.poolIds]).toEqual(derived.tournament.pools.map((pool) => pool.id));
    }
  });

  it.each(["rwc2027", "rwc2023"] as const)("keeps every own-pool game before %s qualification without changing predictions", (tournamentId) => {
    const derived = deriveScenario(blank(tournamentId));
    const before = structuredClone(derived);
    for (const team of derived.tournament.teams) {
      const pool = derived.tournament.pools.find((item) => item.teamIds.includes(team.id))!;
      const focused = deriveTeamFocus(derived, team.id);
      const visiblePoolGames = derived.fixtures.filter((fixture) => fixture.stage === "pool" && focused.fixtureIds.has(fixture.id));
      expect(visiblePoolGames.map((fixture) => fixture.id)).toEqual(derived.fixtures.filter((fixture) => fixture.pool === pool.id).map((fixture) => fixture.id));
      expect(visiblePoolGames).toHaveLength(tournamentId === "rwc2027" ? 6 : 10);
      expect([...focused.poolIds]).toEqual([pool.id]);
    }
    expect(derived).toEqual(before);
  });

  it("keeps first, second and official possible third entry slots while the own pool is undecided", () => {
    const derived = deriveScenario(blank());
    const focused = deriveTeamFocus(derived, "nz");
    expect(focused.fixtureIds.has(38)).toBe(true); // Winner A.
    expect(focused.fixtureIds.has(43)).toBe(true); // Runner-up A.
    expect(focused.fixtureIds.has(41)).toBe(true); // Third A faces winner C in the official table.
    expect(focused.fixtureIds.has(52)).toBe(true);
    expect(focused.fixtureIds.has(51)).toBe(true);
    expect(derived.fixtures.filter((fixture) => fixture.stage === "pool" && focused.fixtureIds.has(fixture.id))).toHaveLength(6);
  });

  it.each(["rwc2027", "rwc2023"] as const)("follows only each team's played knockout path once all %s predictions are valid", (tournamentId) => {
    const derived = deriveScenario(filled(tournamentId));
    expect(derived.fixtures.every((fixture) => fixture.result && !fixture.issues.length)).toBe(true);
    for (const team of derived.tournament.teams) {
      const expected = derived.fixtures.filter((fixture) => fixture.stage !== "pool"
        && (fixture.homeTeam?.id === team.id || fixture.awayTeam?.id === team.id)).map((fixture) => fixture.id);
      expect(knockouts(derived, team.id)).toEqual(expected);
    }
    if (tournamentId === "rwc2027") {
      expect(knockouts(derived, "za")).toEqual([40, 45, 49, 52]);
      expect(knockouts(derived, "nz")).toEqual([38, 45]);
      expect(knockouts(derived, "hk")).toEqual([]);
    }
  });

  it("retains all best-third pool dependencies only for a complete own-pool third", () => {
    const complete = deriveScenario(filled());
    const third = complete.standings.B[2].teamId;
    const focused = deriveTeamFocus(complete, third);
    expect([...focused.poolIds].sort()).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(complete.fixtures.filter((fixture) => fixture.stage === "pool" && focused.fixtureIds.has(fixture.id))).toHaveLength(36);
    expect([...deriveTeamFocus(complete, "za").poolIds]).toEqual(["B"]);
    const otherPoolIncomplete = deriveScenario(change(filled(), 1));
    expect([...deriveTeamFocus(otherPoolIncomplete, third).poolIds].sort()).toEqual(["A", "B", "C", "D", "E", "F"]);
    const fourth = otherPoolIncomplete.standings.B[3].teamId;
    expect(knockouts(otherPoolIncomplete, fourth)).toEqual([]);
    expect([...deriveTeamFocus(otherPoolIncomplete, fourth).poolIds]).toEqual(["B"]);
  });

  it("opens unresolved opponent feeders and stops at valid predicted ancestry", () => {
    const semifinalOpen = deriveScenario(change(filled(), 50));
    expect(knockouts(semifinalOpen, "za")).toEqual([40, 45, 49, 50, 52]);
    const quarterOpen = deriveScenario(change(change(filled(), 50), 48));
    expect(knockouts(quarterOpen, "za")).toEqual([40, 45, 48, 49, 50, 52]);
    const firstRoundOpen = deriveScenario(change(change(change(filled(), 50), 48), 44));
    expect(knockouts(firstRoundOpen, "za")).toEqual([40, 44, 45, 48, 49, 50, 52]);
    expect(deriveTeamFocus(firstRoundOpen, "za").fixtureIds.has(43)).toBe(false);
  });

  it("follows semifinal defeat to bronze and honours advancement after a drawn score", () => {
    const lost = deriveScenario(change(filled(), 49, { winner: "away" }));
    expect(knockouts(lost, "za")).toEqual([40, 45, 49, 51]);
    const drawn = deriveScenario(change(filled(), 49, { winner: "draw", advancing: "away", homeScore: 20, awayScore: 20 }));
    expect(drawn.fixtures.find((fixture) => fixture.id === 49)?.issues).toEqual([]);
    expect(knockouts(drawn, "za")).toEqual([40, 45, 49, 51]);
  });

  it("keeps both later routes when an own result conflicts instead of trusting its displayed winner", () => {
    const derived = deriveScenario(change(filled(), 49, { winner: "home", homeScore: 0, awayScore: 10 }));
    expect(derived.fixtures.find((fixture) => fixture.id === 49)?.issues.length).toBeGreaterThan(0);
    expect(knockouts(derived, "za")).toEqual([40, 45, 49, 51, 52]);
  });

  it("reopens a conflicting opponent feeder without revealing valid sibling branches", () => {
    const derived = deriveScenario(change(filled(), 50, { winner: "home", homeScore: 0, awayScore: 10 }));
    expect(knockouts(derived, "za")).toEqual([40, 45, 49, 50, 52]);
    expect(deriveTeamFocus(derived, "za").fixtureIds.has(47)).toBe(false);
    expect(deriveTeamFocus(derived, "za").fixtureIds.has(48)).toBe(false);
  });
});
