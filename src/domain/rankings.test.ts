import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { projectRankedMatch, rankingProjection, rankingSnapshot } from "./rankings";
import type { RankedTeam } from "./rankings";
import { defaultTournament, getTournament } from "./tournaments";
import type { Fixture, Team, Tournament } from "./types";

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

describe("World Rugby ranking projection", () => {
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
