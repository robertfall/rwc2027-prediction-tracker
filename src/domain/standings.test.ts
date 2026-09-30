import { describe, expect, it } from "vitest";
import { calculateStandings, compareThirds, emptyStanding, rankPool } from "./standings";
import { defaultTournament, getTournament } from "./tournaments";
import type { ResolvedFixture, Standing } from "./types";

function game(home: string, away: string, homeScore: number, awayScore: number, homeTries = 0, awayTries = 0): ResolvedFixture {
  const winner = homeScore === awayScore ? "draw" : homeScore > awayScore ? "home" : "away";
  return {
    id: 200, stage: "pool", pool: "A", kickoff: "2027-10-01T00:00:00Z", venue: "Test venue",
    home: { kind: "team", teamId: home }, away: { kind: "team", teamId: away },
    homeTeam: defaultTournament.teams.find((team) => team.id === home),
    awayTeam: defaultTournament.teams.find((team) => team.id === away),
    result: { homeScore, awayScore, homeTries, awayTries, winner }, issues: [],
  };
}

function row(teamId: string, overrides: Partial<Standing>): Standing {
  return { ...emptyStanding(teamId), ...overrides };
}

describe("pool scoring and statistical totals", () => {
  it.each([7, 8])("gives a losing bonus through seven points only (margin %i)", (margin) => {
    const table = calculateStandings(defaultTournament, [game("nz", "au", 20, 20 + margin, 2, 3)]).A;
    expect(table.find((team) => team.teamId === "nz")?.points).toBe(margin === 7 ? 1 : 0);
    expect(table.find((team) => team.teamId === "au")?.points).toBe(4);
  });

  it("allows both bonuses for a losing team and records complete WDL, scores and tries", () => {
    const table = calculateStandings(defaultTournament, [game("nz", "au", 20, 27, 4, 3)]).A;
    expect(table.find((team) => team.teamId === "nz")).toMatchObject({
      played: 1, wins: 0, draws: 0, losses: 1, points: 2, pointsFor: 20, pointsAgainst: 27,
      triesFor: 4, triesAgainst: 3, tryBonuses: 1, losingBonuses: 1,
    });
    expect(table.find((team) => team.teamId === "au")).toMatchObject({ played: 1, wins: 1, losses: 0, points: 4 });
    expect(table.find((team) => team.teamId === "cl")).toEqual(emptyStanding("cl"));
  });

  it("awards draw and try bonuses without a losing bonus", () => {
    const table = calculateStandings(defaultTournament, [game("nz", "au", 20, 20, 4, 4)]).A;
    for (const team of table.filter((team) => team.teamId === "nz" || team.teamId === "au")) {
      expect(team).toMatchObject({ played: 1, draws: 1, wins: 0, losses: 0, points: 3, tryBonuses: 1, losingBonuses: 0 });
    }
  });

  it("adds numeric totals across matches and conserves aggregate for/against values", () => {
    const table = calculateStandings(defaultTournament, [game("nz", "au", 9, 10), game("nz", "cl", 30, 0, 4, 0)]).A;
    expect(table.find((team) => team.teamId === "nz")).toMatchObject({ played: 2, wins: 1, losses: 1, points: 6, pointsFor: 39, pointsAgainst: 10 });
    expect(table.reduce((total, team) => total + team.pointsFor, 0)).toBe(table.reduce((total, team) => total + team.pointsAgainst, 0));
    expect(table.reduce((total, team) => total + team.triesFor, 0)).toBe(table.reduce((total, team) => total + team.triesAgainst, 0));
  });

  it("excludes untouched, incomplete and conflicting fixtures", () => {
    const incomplete = game("nz", "au", 24, 17);
    incomplete.result = undefined;
    const conflict = game("nz", "cl", 24, 17);
    conflict.issues = ["Conflicting explicit choices"];
    expect(calculateStandings(defaultTournament, [incomplete, conflict]).A.every((team) => team.played === 0)).toBe(true);
  });
});

describe("ordered tie-break rules", () => {
  it("uses competition points before any tie-break statistic", () => {
    const table = rankPool([row("nz", { points: 4, pointsFor: 100 }), row("au", { points: 5 })], [], defaultTournament);
    expect(table.map((team) => team.teamId)).toEqual(["au", "nz"]);
  });

  it("prioritizes the direct winner over better overall points difference", () => {
    const table = rankPool([row("nz", { points: 10, pointsFor: 20 }), row("au", { points: 10, pointsFor: 200 })], [game("nz", "au", 24, 17)], defaultTournament);
    expect(table.map((team) => team.teamId)).toEqual(["nz", "au"]);
  });

  it("breaks a three-way tie then restarts head-to-head for the remaining two", () => {
    const tournament = getTournament("rwc2023");
    const table = rankPool([
      row("ie", { points: 10, pointsFor: 200 }), row("za", { points: 10, pointsFor: 100 }), row("gb-sct", { points: 10, pointsFor: 150 }),
    ], [game("ie", "za", 24, 17), game("za", "gb-sct", 24, 17), game("gb-sct", "ie", 24, 17)], tournament);
    expect(table.map((team) => team.teamId)).toEqual(["ie", "za", "gb-sct"]);
  });

  it.each([
    [{ pointsFor: 100, pointsAgainst: 20 }, { pointsFor: 100, pointsAgainst: 30 }],
    [{ triesFor: 10, triesAgainst: 1 }, { triesFor: 10, triesAgainst: 2 }],
    [{ pointsFor: 30, pointsAgainst: 30 }, { pointsFor: 20, pointsAgainst: 20 }],
    [{ triesFor: 5, triesAgainst: 5 }, { triesFor: 4, triesAgainst: 4 }],
  ])("applies the successive statistical tie breakers after a direct draw", (a, b) => {
    const table = rankPool([row("au", { points: 8, ...a }), row("nz", { points: 8, ...b })], [game("au", "nz", 21, 21)], defaultTournament);
    expect(table[0].teamId).toBe("au");
  });

  it("uses the versioned ordinal ranking snapshot as the last sporting criterion", () => {
    expect(rankPool([row("au", { points: 8 }), row("nz", { points: 8 })], [game("au", "nz", 21, 21)], defaultTournament)[0].teamId).toBe("nz");
  });

  it("uses the newer best-third order and does not substitute try difference for points scored", () => {
    const a = row("au", { points: 5, pointsFor: 100, pointsAgainst: 100, triesFor: 5, triesAgainst: 0 });
    const b = row("nz", { points: 5, pointsFor: 110, pointsAgainst: 110, triesFor: 4, triesAgainst: 20 });
    expect(compareThirds(a, b, defaultTournament)).toBeGreaterThan(0);
    expect(compareThirds({ ...a, pointsFor: 110, pointsAgainst: 110 }, b, defaultTournament)).toBeLessThan(0);
  });
});
