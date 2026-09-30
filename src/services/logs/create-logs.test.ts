import { describe, expect, it } from "vitest";
import { poolA } from "../../data/teams";
import { createLogEntries, MatchResult } from "./create-logs";

const match: MatchResult = {
  matchNumber: 1,
  touched: true,
  homeTeam: "France",
  awayTeam: "New Zealand",
  homeScore: 20,
  awayScore: 13,
  homeTries: 3,
  awayTries: 2,
};

describe("standings", () => {
  it("includes every known pool team before any match is complete", () => {
    const entries = createLogEntries([], poolA);
    expect(entries.map((entry) => entry.team)).toEqual(poolA);
    expect(entries.every((entry) => entry.points === 0 && entry.matchesPlayed === 0)).toBe(true);
  });

  it("records played, wins, losses, points difference, tries, and losing bonus points", () => {
    const entries = createLogEntries([Object.freeze({ ...match })], poolA);
    expect(entries.find((entry) => entry.team === "France")).toEqual({ team: "France", points: 4, tries: 3, pointsDifference: 7, matchesPlayed: 1, matchesWon: 1, matchesLost: 0, matchesDrawn: 0 });
    expect(entries.find((entry) => entry.team === "New Zealand")).toEqual({ team: "New Zealand", points: 1, tries: 2, pointsDifference: -7, matchesPlayed: 1, matchesWon: 0, matchesLost: 1, matchesDrawn: 0 });
    expect(entries.find((entry) => entry.team === "Italy")?.matchesPlayed).toBe(0);
    expect(entries).toHaveLength(5);
  });

  it("accumulates draws and separate matches while preserving accounting", () => {
    const draw: MatchResult = { ...match, matchNumber: 2, awayTeam: "Italy", homeScore: 15, awayScore: 15, homeTries: 3, awayTries: 3 };
    const entries = createLogEntries([match, draw], poolA);
    expect(entries.find((entry) => entry.team === "France")).toMatchObject({ points: 6, tries: 6, matchesPlayed: 2, matchesWon: 1, matchesLost: 0, matchesDrawn: 1 });
    expect(entries.find((entry) => entry.team === "Italy")).toMatchObject({ points: 2, matchesPlayed: 1, matchesDrawn: 1 });
    for (const entry of entries) expect(entry.matchesPlayed).toBe(entry.matchesWon + entry.matchesLost + entry.matchesDrawn);
  });

  it("ignores pristine, partial, and invalid runtime values instead of counting bogus matches", () => {
    const incomplete: MatchResult = { matchNumber: 1, touched: true, homeTeam: "France", awayTeam: "New Zealand", homeScore: 20 };
    const pristine: MatchResult = { matchNumber: 1, touched: false, homeTeam: "France", awayTeam: "New Zealand" };
    const stringScore = { ...match, homeScore: "20" } as unknown as MatchResult;
    const entries = createLogEntries([incomplete, pristine, stringScore], poolA);
    expect(entries.every((entry) => entry.points === 0 && entry.matchesPlayed === 0 && entry.tries === 0)).toBe(true);
  });
});
