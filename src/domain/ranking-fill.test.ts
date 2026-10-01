import { describe, expect, it } from "vitest";
import { completePrediction } from "./completion";
import { deriveScenario } from "./derive";
import { planRankingFill } from "./ranking-fill";
import { reconcileScenario } from "./reconcile";
import { defaultTournament, getTournament } from "./tournaments";
import type { PredictionIntent, PredictionUpdate, Scenario, Tournament } from "./types";

function blank(tournamentId: Tournament["id"] = "rwc2027"): Scenario {
  const tournament = getTournament(tournamentId);
  return {
    schemaVersion: 2, tournamentId, datasetVersion: tournament.datasetVersion,
    rulesVersion: tournament.rulesVersion, completionVersion: "defaults-v1", predictions: {}, resolved: {},
  };
}

function apply(scenario: Scenario, updates: PredictionUpdate[]): Scenario {
  const next = structuredClone(scenario);
  next.resolved ??= {};
  for (const update of updates) {
    next.predictions[update.fixtureId] = {
      intent: structuredClone(update.intent),
      ...(update.participants ? { participants: [...update.participants] } : {}),
    };
    next.resolved[update.fixtureId] = structuredClone(update.result);
  }
  return reconcileScenario(next).scenario;
}

function manualPick(scenario: Scenario, fixtureId: number, intent: PredictionIntent): Scenario {
  const next = structuredClone(scenario);
  const fixture = deriveScenario(next).fixtures.find((entry) => entry.id === fixtureId)!;
  next.predictions[fixtureId] = {
    intent,
    ...(fixture.stage !== "pool" && fixture.homeTeam && fixture.awayTeam
      ? { participants: [fixture.homeTeam.id, fixture.awayTeam.id] as [string, string] } : {}),
  };
  delete next.resolved?.[fixtureId];
  return reconcileScenario(next).scenario;
}

describe("independent ranking-fill planning", () => {
  it.each(["rwc2027", "rwc2023"] as const)("plans every %s fixture through bronze without changing input or link metadata", (tournamentId) => {
    const initial = blank(tournamentId);
    const saved = structuredClone(initial);
    const plan = planRankingFill(initial);
    const tournament = getTournament(tournamentId);
    expect(plan.updates).toHaveLength(tournament.fixtures.length);
    expect(new Set(plan.updates.map((update) => update.fixtureId)).size).toBe(tournament.fixtures.length);
    expect(plan.conflicts).toBe(0);
    expect(plan.cleared).toBe(0);
    expect(initial).toEqual(saved);
    const completed = apply(initial, plan.updates);
    expect(completed).toMatchObject({
      schemaVersion: initial.schemaVersion, tournamentId: initial.tournamentId,
      datasetVersion: initial.datasetVersion, rulesVersion: initial.rulesVersion, completionVersion: "defaults-v1",
    });
    const derived = deriveScenario(completed);
    expect(derived.poolsComplete).toBe(true);
    expect(derived.fixtures.every((fixture) => fixture.result && fixture.issues.length === 0)).toBe(true);
    expect(Object.keys(completed.resolved!)).toHaveLength(tournament.fixtures.length);
    for (const fixture of derived.fixtures) {
      expect(Object.keys(fixture.prediction!.intent)).toEqual([fixture.stage === "pool" ? "winner" : "advancing"]);
      if (fixture.stage !== "pool") {
        expect(fixture.prediction!.participants).toEqual([fixture.homeTeam!.id, fixture.awayTeam!.id]);
        expect(fixture.result!.advancing).toBe(fixture.result!.winner);
      }
      expect(fixture.result!.homeTries).toBe(Math.floor(fixture.result!.homeScore / 7));
      expect(fixture.result!.awayTries).toBe(Math.floor(fixture.result!.awayScore / 7));
    }
    const bronze = derived.fixtures.find((fixture) => fixture.stage === "bronze")!;
    const semis = derived.fixtures.filter((fixture) => fixture.stage === "semi");
    expect([bronze.homeTeam!.id, bronze.awayTeam!.id]).toEqual(semis.map((semi) =>
      semi.result!.advancing === "home" ? semi.awayTeam!.id : semi.homeTeam!.id));
    expect(planRankingFill(completed)).toEqual({ updates: [], conflicts: 0, cleared: 0 });
  });

  it("pins projected scores independently while manual winner completion stays 24-17", () => {
    const fixture = defaultTournament.fixtures[0];
    const derived = deriveScenario(blank()).fixtures[0];
    expect(completePrediction({ winner: "home" }, fixture, defaultTournament, derived.homeTeam, derived.awayTeam).result)
      .toEqual({ homeScore: 24, awayScore: 17, homeTries: 3, awayTries: 2, winner: "home" });
    const first = planRankingFill(blank()).updates.find((update) => update.fixtureId === fixture.id)!;
    expect(first.intent).toEqual({ winner: "home" });
    expect(first.result).toEqual({ homeScore: 58, awayScore: 8, homeTries: 8, awayTries: 1, winner: "home" });
    expect(apply(blank(), [first]).resolved![fixture.id]).toEqual(first.result);
  });

  it("keeps manual, custom and partial existing results while filling every remaining matchup", () => {
    let scenario = manualPick(blank(), 1, { winner: "away", homeScore: 3, awayScore: 33, homeTries: 0, awayTries: 4 });
    scenario = manualPick(scenario, 2, { awayLosingBonus: false });
    scenario = manualPick(scenario, 3, { winner: "home" });
    const before = structuredClone(scenario);
    const plan = planRankingFill(scenario);
    expect(plan.updates).toHaveLength(49);
    const after = apply(scenario, plan.updates);
    for (const id of [1, 2, 3]) {
      expect(after.predictions[id]).toEqual(before.predictions[id]);
      expect(after.resolved![id]).toEqual(before.resolved![id]);
    }
    expect(after.resolved![3]).toMatchObject({ homeScore: 24, awayScore: 17 });
    expect(scenario).toEqual(before);
  });

  it("preserves conflicting choices and leaves unresolved descendants unpicked", () => {
    const scenario = manualPick(blank(), 1, { winner: "home", homeScore: 0, awayScore: 10 });
    const before = structuredClone(scenario);
    const plan = planRankingFill(scenario);
    expect(plan.updates).toHaveLength(35);
    expect(plan.conflicts).toBe(1);
    expect(plan.updates.every((update) => update.fixtureId <= 36)).toBe(true);
    const after = apply(scenario, plan.updates);
    expect(after.predictions[1]).toEqual(before.predictions[1]);
    expect(after.resolved![1]).toBeUndefined();
    expect(deriveScenario(after).poolsComplete).toBe(false);
    expect(planRankingFill(after)).toEqual({ updates: [], conflicts: 1, cleared: 0 });
    expect(scenario).toEqual(before);
  });

  it("keeps a drawn knockout without advancement unresolved while filling other branches", () => {
    const poolUpdates = planRankingFill(blank()).updates.filter((update) => update.fixtureId <= 36);
    const scenario = manualPick(apply(blank(), poolUpdates), 37, { homeScore: 20, awayScore: 20 });
    const plan = planRankingFill(scenario);
    expect(plan.conflicts).toBe(1);
    expect(plan.updates.some((update) => update.fixtureId === 37)).toBe(false);
    const derived = deriveScenario(apply(scenario, plan.updates));
    expect(derived.fixtures.find((fixture) => fixture.id === 37)!.issues)
      .toContain("Choose which team advances after the drawn score.");
    expect(derived.fixtures.find((fixture) => fixture.id === 46)!.prediction).toBeUndefined();
    expect(derived.fixtures.some((fixture) => fixture.stage !== "pool" && fixture.id !== 37 && fixture.result)).toBe(true);
  });

  it("restores matching dormant knockout choices and custom pins when missing pool results are filled", () => {
    const completed = apply(blank(), planRankingFill(blank()).updates);
    const finalId = 52;
    const final = deriveScenario(completed).fixtures.find((fixture) => fixture.id === finalId)!;
    const advancing = final.result!.advancing!;
    completed.resolved![finalId] = {
      homeScore: advancing === "home" ? 81 : 80, awayScore: advancing === "away" ? 81 : 80,
      homeTries: 11, awayTries: 11, winner: advancing, advancing,
    };
    const missing = structuredClone(completed);
    delete missing.predictions[1];
    delete missing.resolved![1];
    const dormant = reconcileScenario(missing).scenario;
    expect(deriveScenario(dormant).poolsComplete).toBe(false);
    expect(dormant.resolved![finalId]).toEqual(completed.resolved![finalId]);
    const plan = planRankingFill(dormant);
    expect(plan.updates.map((update) => update.fixtureId)).toEqual([1]);
    expect(plan.cleared).toBe(0);
    expect(apply(dormant, plan.updates)).toEqual(completed);
  });

  it("replaces dormant predictions only once new participants prove their binding incompatible", () => {
    let completed = blank();
    for (const fixture of defaultTournament.fixtures) {
      completed = manualPick(completed, fixture.id, fixture.stage === "pool" ? { winner: "home" } : { advancing: "home" });
    }
    let foundReplacement = false;
    for (const fixture of defaultTournament.fixtures.filter((entry) => entry.stage === "pool")) {
      const missing = structuredClone(completed);
      delete missing.predictions[fixture.id];
      delete missing.resolved![fixture.id];
      const dormant = reconcileScenario(missing).scenario;
      const before = structuredClone(dormant);
      const plan = planRankingFill(dormant);
      if (!plan.cleared) continue;
      const after = apply(dormant, plan.updates);
      const derived = deriveScenario(after);
      expect(derived.fixtures.every((entry) => entry.result && entry.issues.length === 0)).toBe(true);
      const replacements = plan.updates.filter((update) => dormant.predictions[update.fixtureId]);
      expect(replacements).toHaveLength(plan.cleared);
      for (const update of replacements) {
        expect(update.participants).not.toEqual(dormant.predictions[update.fixtureId].participants);
      }
      expect(dormant).toEqual(before);
      expect(planRankingFill(after).updates).toEqual([]);
      foundReplacement = true;
      break;
    }
    expect(foundReplacement).toBe(true);
  });
});
