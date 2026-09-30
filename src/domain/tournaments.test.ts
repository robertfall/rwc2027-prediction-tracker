import { describe, expect, it } from "vitest";
import { defaultTournament, getTournament } from "./tournaments";
import { venueTimezones } from "./data-2027";

const localKickoffs: [number, string][] = [
  [1, "01/10/2027, 18:45"], [2, "02/10/2027, 12:15"],
  [4, "02/10/2027, 17:45"], [6, "03/10/2027, 12:15"],
  [7, "03/10/2027, 14:15"], [8, "03/10/2027, 17:15"],
  [16, "09/10/2027, 17:10"], [28, "16/10/2027, 13:15"],
  [38, "23/10/2027, 15:45"], [40, "23/10/2027, 18:45"],
  [51, "12/11/2027, 19:45"], [52, "13/11/2027, 20:00"],
];

describe("versioned tournament definitions", () => {
  it("contains 24 teams, every pool pairing exactly once, and the full 52-game bracket", () => {
    const tournament = defaultTournament;
    expect(tournament.teams).toHaveLength(24);
    expect(tournament.pools).toHaveLength(6);
    expect(new Set(tournament.pools.flatMap((pool) => pool.teamIds)).size).toBe(24);
    expect(tournament.fixtures.map((fixture) => fixture.id)).toEqual(Array.from({ length: 52 }, (_, index) => index + 1));
    expect(tournament.fixtures.reduce<Record<string, number>>((counts, fixture) => {
      counts[fixture.stage] = (counts[fixture.stage] ?? 0) + 1;
      return counts;
    }, {})).toEqual({ pool: 36, round16: 8, quarter: 4, semi: 2, bronze: 1, final: 1 });
    for (const pool of tournament.pools) {
      const fixtures = tournament.fixtures.filter((fixture) => fixture.pool === pool.id);
      expect(fixtures).toHaveLength(6);
      const pairs = fixtures.map((fixture) => {
        expect(fixture.home.kind).toBe("team");
        expect(fixture.away.kind).toBe("team");
        if (fixture.home.kind !== "team" || fixture.away.kind !== "team") throw new Error("Unexpected source");
        expect(pool.teamIds).toContain(fixture.home.teamId);
        expect(pool.teamIds).toContain(fixture.away.teamId);
        return [fixture.home.teamId, fixture.away.teamId].sort().join("/");
      });
      expect(new Set(pairs).size).toBe(6);
      for (const teamId of pool.teamIds) expect(pairs.filter((pair) => pair.split("/").includes(teamId))).toHaveLength(3);
    }
    for (const fixture of tournament.fixtures) {
      for (const source of [fixture.home, fixture.away]) {
        if (source.kind === "winner" || source.kind === "loser") expect(source.fixtureId).toBeLessThan(fixture.id);
      }
    }
  });

  it.each(localKickoffs)("reproduces official venue-local kickoff for match %i across Australian DST", (id, expected) => {
    const fixture = defaultTournament.fixtures.find((fixture) => fixture.id === id)!;
    const value = new Intl.DateTimeFormat("en-GB", {
      timeZone: venueTimezones[fixture.venue], year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(new Date(fixture.kickoff));
    expect(value).toBe(expected);
  });

  it("keeps all legacy IDs and 2023 participants in their original tournament", () => {
    const legacy = getTournament("rwc2023");
    expect(legacy.teams).toHaveLength(20);
    expect(legacy.fixtures).toHaveLength(48);
    expect(legacy.fixtures[0]).toMatchObject({ id: 1, home: { teamId: "fr" }, away: { teamId: "nz" } });
    expect(legacy.fixtures[40]).toMatchObject({ id: 41, stage: "quarter", home: { pool: "C", position: 1 } });
    expect(legacy.fixtures[46].stage).toBe("bronze");
    expect(legacy.fixtures[47].stage).toBe("final");
    expect(legacy.fixtures.every((fixture) => Number.isFinite(Date.parse(fixture.kickoff)))).toBe(true);
    expect(legacy.rankings.ie).toBe(1);
    expect(legacy.rankings.jp).toBe(12);
    expect(legacy.rankingsLabel).toContain("2 October 2023");
  });

  it("labels the future ranking fallback and 2027 rule assumptions honestly", () => {
    expect(defaultTournament.rulesStatus).toBe("provisional");
    expect(defaultTournament.rankingsLabel).toContain("1 December 2025");
    expect(defaultTournament.rulesNote).toContain("18 October 2027");
    expect(defaultTournament.rankings.ca).toBe(25);
    expect(defaultTournament.sources).toHaveLength(4);
  });
});
