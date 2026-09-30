import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { completePrediction, validateIntent } from "./completion";
import { defaultTournament } from "./tournaments";
import type { Fixture, PredictionIntent } from "./types";

const pool = defaultTournament.fixtures.find((fixture) => fixture.stage === "pool")!;
const home = defaultTournament.teams.find((team) => pool.home.kind === "team" && team.id === pool.home.teamId)!;
const away = defaultTournament.teams.find((team) => pool.away.kind === "team" && team.id === pool.away.teamId)!;
const knockout: Fixture = { ...pool, stage: "round16" };
const complete = (intent: PredictionIntent, fixture = pool) => completePrediction(intent, fixture, defaultTournament, home, away);

describe("Deterministic constrained completion", () => {
  it("leaves untouched matches unpicked and requires known knockout participants", () => {
    expect(complete({})).toEqual({ issues: [] });
    expect(completePrediction({ advancing: "home" }, knockout, defaultTournament).result).toBeUndefined();
  });

  it("completes winner-only picks and draws consistently", () => {
    for (const winner of ["home", "away", "draw"] as const) {
      const outcome = complete({ winner });
      expect(outcome.issues).toEqual([]);
      expect(outcome.result?.winner).toBe(winner);
      expect(complete({ winner })).toEqual(outcome);
    }
  });

  it("respects all legal margins while retaining explicit scores and tries", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 255 }), fc.constantFrom("home" as const, "away" as const), (margin, winner) => {
      const outcome = complete({ winner, margin });
      expect(outcome.issues).toEqual([]);
      expect(Math.abs(outcome.result!.homeScore - outcome.result!.awayScore)).toBe(margin);
      expect(outcome.result!.winner).toBe(winner);
    }));
    const outcome = complete({ homeScore: 9, awayScore: 10, homeTries: 1, awayTries: 2 });
    expect(outcome.issues).toEqual([]);
    expect(outcome.result).toMatchObject({ homeScore: 9, awayScore: 10, homeTries: 1, awayTries: 2, winner: "away" });
  });

  it("finds coherent scores for explicit try and losing bonuses", () => {
    const outcome = complete({ winner: "home", homeTryBonus: true, awayTryBonus: false, awayLosingBonus: true });
    expect(outcome.issues).toEqual([]);
    expect(outcome.result!.homeTries).toBeGreaterThanOrEqual(4);
    expect(outcome.result!.awayTries).toBeLessThan(4);
    expect(outcome.result!.homeScore - outcome.result!.awayScore).toBeGreaterThan(0);
    expect(outcome.result!.homeScore - outcome.result!.awayScore).toBeLessThanOrEqual(7);
    const noBonus = complete({ winner: "home", awayLosingBonus: false });
    expect(noBonus.issues).toEqual([]);
    expect(noBonus.result!.homeScore - noBonus.result!.awayScore).toBeGreaterThan(7);
  });

  it("preserves contradictory explicit choices and explains them", () => {
    const outcome = complete({ winner: "home", margin: 7, homeScore: 3, awayScore: 10, homeTries: 4, homeTryBonus: false, homeLosingBonus: false });
    expect(outcome.result).toMatchObject({ homeScore: 3, awayScore: 10, homeTries: 4, winner: "away" });
    expect(outcome.issues.join(" ")).toContain("chosen winner");
    expect(outcome.issues.join(" ")).toContain("cannot include");
    expect(outcome.issues.join(" ")).toContain("try bonus");
    expect(outcome.issues.join(" ")).toContain("losing bonus");
  });

  it("keeps a regulation draw distinct from knockout advancement", () => {
    const outcome = complete({ homeScore: 20, awayScore: 20, advancing: "away" }, knockout);
    expect(outcome.issues).toEqual([]);
    expect(outcome.result).toMatchObject({ winner: "draw", advancing: "away" });
    expect(complete({ homeScore: 20, awayScore: 20 }, knockout).issues).toContain("Choose which team advances after the drawn score.");
    expect(complete({ advancing: "home", awayScore: 80 }, knockout).result!.homeScore).toBeGreaterThanOrEqual(80);
    expect(complete({ advancing: "home", awayScore: 80 }, knockout).issues).toEqual([]);
  });

  it.each([
    { homeScore: "24" }, { homeScore: NaN }, { homeScore: 256 }, { awayScore: -1 },
    { homeTries: 16 }, { homeTries: 1.5 }, { homeTryBonus: 1 }, { awayLosingBonus: "false" },
    { winner: "either" }, { advancing: "draw" }, { arbitraryField: 3 },
  ])("rejects unknown or invalid runtime choices (%j)", (intent) => {
    expect(() => validateIntent(intent)).toThrow(RangeError);
  });
});
