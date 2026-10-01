import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { completePrediction } from "./completion";
import { deriveScenario } from "./derive";
import { projectRankedMatch, rankingProjection, rankingSnapshot } from "./rankings";
import type { RankedTeam } from "./rankings";
import { defaultTournament, getTournament } from "./tournaments";
import type { Fixture, PredictionIntent, Scenario, Team, Tournament } from "./types";

function ranked(teamId: string, rating: number, position = 1): RankedTeam {
  return { teamId, rating, position, name: teamId, worldRugbyTeamId: teamId };
}

function teamsFor(tournament: Tournament, fixture: Fixture): [Team, Team] {
  if (fixture.home.kind !== "team" || fixture.away.kind !== "team") throw new Error("Expected direct participants");
  const homeId = fixture.home.teamId;
  const awayId = fixture.away.teamId;
  return [tournament.teams.find((team) => team.id === homeId)!,
    tournament.teams.find((team) => team.id === awayId)!];
}

const fixture = defaultTournament.fixtures[0];
const [home, away] = teamsFor(defaultTournament, fixture);
const complete = (intent: PredictionIntent, match = fixture) =>
  completePrediction(intent, match, defaultTournament, home, away, "rankings-v1");

describe("versioned World Rugby ranking projection", () => {
  it.each(["rwc2027", "rwc2023"] as const)("covers every possible matchup in %s with immutable dated inputs", (id) => {
    const tournament = getTournament(id);
    const snapshot = rankingSnapshot(id);
    expect(snapshot.effectiveDate).toBe(id === "rwc2027" ? "2026-09-28" : "2023-10-02");
    expect(snapshot.source).toContain(`date=${snapshot.effectiveDate}`);
    expect(snapshot.rawSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(new Set(snapshot.teams.map((team) => team.teamId))).toEqual(new Set(tournament.teams.map((team) => team.id)));
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.teams)).toBe(true);
    expect(snapshot.teams.every((team) => Object.isFrozen(team))).toBe(true);
    for (const homeTeam of tournament.teams) {
      for (const awayTeam of tournament.teams.filter((team) => team.id !== homeTeam.id)) {
        const projection = rankingProjection(tournament, homeTeam, awayTeam);
        expect(projection.winner).not.toBe("draw");
        expect(projection.homeScore).toBeGreaterThanOrEqual(3);
        expect(projection.awayScore).toBeGreaterThanOrEqual(3);
        expect(Math.max(projection.homeScore, projection.awayScore)).toBeLessThanOrEqual(103);
      }
    }
  });

  it("turns rating points rather than ordinal-position differences into the score margin", () => {
    expect(projectRankedMatch(ranked("a", 80, 1), ranked("b", 79, 100)))
      .toEqual({ homeScore: 22, awayScore: 20, winner: "home" });
    expect(projectRankedMatch(ranked("a", 80, 1), ranked("b", 40, 2)))
      .toEqual({ homeScore: 83, awayScore: 3, winner: "home" });
    expect(rankingProjection(defaultTournament, home, away)).toEqual({ homeScore: 58, awayScore: 8, winner: "home" });
  });

  it("uses the engine snapshot independently of unchanged qualification tie-break ranks", () => {
    const uruguay = defaultTournament.teams.find((team) => team.id === "uy")!;
    const portugal = defaultTournament.teams.find((team) => team.id === "pt")!;
    expect(defaultTournament.rankings.uy).toBeLessThan(defaultTournament.rankings.pt);
    expect(rankingProjection(defaultTournament, uruguay, portugal)).toEqual({ homeScore: 19, awayScore: 26, winner: "away" });
  });

  it("increases the margin monotonically with rating gap and caps extreme mismatches", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 100_000 }), fc.integer({ min: 0, max: 100_000 }), (first, second) => {
      const smallGap = Math.min(first, second) / 1000;
      const largeGap = Math.max(first, second) / 1000;
      const small = projectRankedMatch(ranked("a", smallGap), ranked("b", 0));
      const large = projectRankedMatch(ranked("a", largeGap), ranked("b", 0));
      const smallMargin = small.homeScore - small.awayScore;
      const largeMargin = large.homeScore - large.awayScore;
      expect(smallMargin).toBeGreaterThanOrEqual(1);
      expect(largeMargin).toBeGreaterThanOrEqual(smallMargin);
      expect(largeMargin).toBeLessThanOrEqual(100);
      expect(large.awayScore).toBeLessThanOrEqual(small.awayScore);
    }));
    expect(projectRankedMatch(ranked("a", 1000), ranked("b", 0)))
      .toEqual({ homeScore: 103, awayScore: 3, winner: "home" });
  });

  it("mirrors scores when the first-listed and second-listed teams swap, without home advantage", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 100_000 }), fc.integer({ min: 0, max: 100_000 }), (first, second) => {
      const a = ranked("a", first / 1000, 1);
      const b = ranked("b", second / 1000, 2);
      const before = projectRankedMatch(a, b);
      const after = projectRankedMatch(b, a);
      expect(after.homeScore).toBe(before.awayScore);
      expect(after.awayScore).toBe(before.homeScore);
      expect(after.winner).toBe(before.winner === "home" ? "away" : "home");
    }));
  });

  it("breaks equal-rating ties by the snapshot ordinal and then stable team identifier", () => {
    expect(projectRankedMatch(ranked("z", 80, 1), ranked("a", 80, 2)))
      .toEqual({ homeScore: 22, awayScore: 21, winner: "home" });
    expect(projectRankedMatch(ranked("z", 80, 1), ranked("a", 80, 1)))
      .toEqual({ homeScore: 21, awayScore: 22, winner: "away" });
  });

  it("keeps an explicitly chosen underdog or draw while using the same rating-gap scale", () => {
    expect(rankingProjection(defaultTournament, home, away, "away"))
      .toEqual({ homeScore: 8, awayScore: 58, winner: "away" });
    expect(rankingProjection(defaultTournament, home, away, "draw"))
      .toEqual({ homeScore: 21, awayScore: 21, winner: "draw" });
  });

  it("rejects missing or malformed ranking inputs instead of assigning a zero rating", () => {
    expect(() => rankingProjection(defaultTournament, { ...home, id: "missing" }, away)).toThrow(/No ranking points/);
    for (const rating of [NaN, Infinity, -1]) {
      expect(() => projectRankedMatch(ranked("a", rating), ranked("b", 80))).toThrow(RangeError);
    }
    expect(() => projectRankedMatch(ranked("a", 80, 0), ranked("b", 80))).toThrow(RangeError);
  });
});

describe("rankings-v1 constrained completion", () => {
  it("keeps untouched fixtures unpicked and missing participants unresolved", () => {
    expect(complete({})).toEqual({ issues: [] });
    expect(completePrediction({ winner: "home" }, fixture, defaultTournament, undefined, away, "rankings-v1"))
      .toEqual({ issues: ["Choose the earlier results to resolve these teams."] });
  });

  it("uses the rating projection for winner-only suggestions and derives tries from scores", () => {
    expect(complete({ winner: "home" })).toEqual({
      issues: [], result: { homeScore: 58, awayScore: 8, homeTries: 8, awayTries: 1, winner: "home" },
    });
    expect(complete({ winner: "away" }).result).toMatchObject({ homeScore: 8, awayScore: 58, homeTries: 1, awayTries: 8 });
    expect(complete({ winner: "draw" }).result).toMatchObject({ homeScore: 21, awayScore: 21, homeTries: 3, awayTries: 3 });
  });

  it("retains defaults-v1 verbatim when the version is omitted or explicitly old", () => {
    const expected = { issues: [], result: { homeScore: 24, awayScore: 17, homeTries: 3, awayTries: 2, winner: "home" } };
    expect(completePrediction({ winner: "home" }, fixture, defaultTournament, home, away)).toEqual(expected);
    expect(completePrediction({ winner: "home" }, fixture, defaultTournament, home, away, "defaults-v1")).toEqual(expected);
  });

  it("retains legal explicit scores, margins, tries and bonuses over model suggestions", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 255 }), fc.constantFrom("home" as const, "away" as const), (margin, winner) => {
      const outcome = complete({ winner, margin });
      expect(outcome.issues).toEqual([]);
      expect(Math.abs(outcome.result!.homeScore - outcome.result!.awayScore)).toBe(margin);
      expect(outcome.result!.winner).toBe(winner);
    }));
    expect(complete({ homeScore: 9, awayScore: 10, homeTries: 1, awayTries: 2 }).result)
      .toMatchObject({ homeScore: 9, awayScore: 10, homeTries: 1, awayTries: 2, winner: "away" });
    const bonuses = complete({ winner: "home", homeTryBonus: true, awayTryBonus: false, awayLosingBonus: true });
    expect(bonuses.issues).toEqual([]);
    expect(bonuses.result!.homeTries).toBeGreaterThanOrEqual(4);
    expect(bonuses.result!.awayTries).toBeLessThan(4);
    expect(bonuses.result!.homeScore - bonuses.result!.awayScore).toBeLessThanOrEqual(7);
    const knockout = complete({ homeScore: 20, awayScore: 20, advancing: "away" }, { ...fixture, stage: "round16" });
    expect(knockout.issues).toEqual([]);
    expect(knockout.result).toMatchObject({ homeScore: 20, awayScore: 20, winner: "draw", advancing: "away" });
  });

  it("keeps contradictory explicit intent visible and excludes it from standings", () => {
    const intent: PredictionIntent = { winner: "home", homeScore: 3, awayScore: 10, homeTries: 4, homeTryBonus: false };
    const completion = complete(intent);
    expect(completion.result).toMatchObject({ homeScore: 3, awayScore: 10, homeTries: 4 });
    expect(completion.issues.join(" ")).toContain("chosen winner");
    expect(completion.issues.join(" ")).toContain("cannot include");
    expect(completion.issues.join(" ")).toContain("try bonus");
    const scenario: Scenario = {
      schemaVersion: 2, tournamentId: defaultTournament.id, datasetVersion: defaultTournament.datasetVersion,
      rulesVersion: defaultTournament.rulesVersion, completionVersion: "rankings-v1", predictions: { [fixture.id]: { intent } },
    };
    expect(deriveScenario(scenario).standings.A.every((row) => row.played === 0)).toBe(true);
  });

  it("dispatches the scenario version during derivation and honours pinned replayed outcomes", () => {
    const scenario: Scenario = {
      schemaVersion: 2, tournamentId: defaultTournament.id, datasetVersion: defaultTournament.datasetVersion,
      rulesVersion: defaultTournament.rulesVersion, completionVersion: "rankings-v1",
      predictions: { [fixture.id]: { intent: { winner: "home" } } },
    };
    expect(deriveScenario(scenario).fixtures[0].result).toMatchObject({ homeScore: 58, awayScore: 8 });
    scenario.completionVersion = "defaults-v1";
    const saved = deriveScenario(scenario).fixtures[0].result!;
    expect(saved).toMatchObject({ homeScore: 24, awayScore: 17 });
    scenario.completionVersion = "rankings-v1";
    scenario.resolved = { [fixture.id]: saved };
    expect(deriveScenario(scenario).fixtures[0].result).toEqual(saved);
  });
});
