import { describe, expect, it, vi } from "vitest";
import { createScenarioController, emptyScenario, type ScenarioController } from "./controller";
import { defaultTournament } from "../domain/tournaments";
import { decodeScenario, encodeScenario } from "./codec";
import { planRankingFill } from "../domain/ranking-fill";

function pickPools(controller: ScenarioController): void {
  for (const fixture of controller.getState().derived.fixtures.filter((entry) => entry.stage === "pool")) controller.update(fixture.id, { winner: "home" });
}
function pickBracket(controller: ScenarioController): void {
  for (const fixture of controller.getState().derived.fixtures.filter((entry) => entry.stage !== "pool")) controller.update(fixture.id, { advancing: "home" });
}
function fillFromRankings(controller: ScenarioController): void {
  const { updates, conflicts, cleared } = planRankingFill(controller.getState().scenario);
  const notice = `${updates.length} ${updates.length === 1 ? "match" : "matches"} filled from world rankings.` +
    (cleared ? ` ${cleared} dependent ${cleared === 1 ? "pick was" : "picks were"} replaced because the teams changed.` : "") +
    (conflicts ? ` ${conflicts} conflicting ${conflicts === 1 ? "match still needs" : "matches still need"} your attention.` : "");
  controller.applyBatch(updates, notice);
}
const firstPool = defaultTournament.fixtures.find((fixture) => fixture.stage === "pool")!.id;

describe("Local scenario actions and history", () => {
  it("makes completion synchronous and keeps explicit intent separate", () => {
    const controller = createScenarioController();
    controller.update(firstPool, { winner: "home" });
    expect(controller.getState().scenario.predictions[firstPool].intent).toEqual({ winner: "home" });
    expect(controller.getState().scenario.resolved?.[firstPool]?.winner).toBe("home");
    expect(controller.getState().canUndo).toBe(true);
    controller.undo();
    expect(controller.getState().scenario.predictions[firstPool]).toBeUndefined();
    controller.redo();
    expect(controller.getState().scenario.predictions[firstPool].intent.winner).toBe("home");
  });

  it("groups continuous field edits and ends the group explicitly", () => {
    const controller = createScenarioController();
    controller.update(firstPool, { homeScore: 2 }, "first-score");
    controller.update(firstPool, { homeScore: 24 }, "first-score");
    controller.finishGroup();
    controller.update(firstPool, { awayScore: 10 }, "other-score");
    controller.undo();
    expect(controller.getState().scenario.predictions[firstPool].intent).toEqual({ homeScore: 24 });
    controller.undo();
    expect(controller.getState().scenario.predictions[firstPool]).toBeUndefined();
    controller.redo();
    expect(controller.getState().scenario.predictions[firstPool].intent).toEqual({ homeScore: 24 });
    controller.update(firstPool, { winner: "away" });
    expect(controller.getState().canRedo).toBe(false);
  });

  it("clears only explicitly cleared fields and does not create history for unchanged input", () => {
    const controller = createScenarioController();
    controller.update(firstPool, { homeScore: 24, awayScore: 17 });
    const unchanged = controller.getState();
    controller.update(firstPool, { homeScore: 24 });
    expect(controller.getState()).toBe(unchanged);
    controller.update(firstPool, { homeScore: undefined });
    expect(controller.getState().scenario.predictions[firstPool].intent).toEqual({ awayScore: 17 });
    controller.undo();
    expect(controller.getState().scenario.predictions[firstPool].intent).toEqual({ homeScore: 24, awayScore: 17 });
  });

  it("makes reset reversible and imported scenarios start a fresh history session", () => {
    const controller = createScenarioController();
    controller.update(firstPool, { winner: "home" });
    const saved = controller.getState().scenario;
    controller.reset();
    expect(controller.getState().scenario.predictions).toEqual({});
    controller.undo();
    expect(controller.getState().scenario).toEqual(saved);
    controller.importScenario(saved);
    expect(controller.getState().canUndo).toBe(false);
    expect(controller.getState().canRedo).toBe(false);
    expect(Object.isFrozen(controller.getState().scenario.predictions[firstPool].intent)).toBe(true);
  });

  it("includes changed-participant consequences in the same undo/redo action", () => {
    const controller = createScenarioController();
    pickPools(controller);
    pickBracket(controller);
    const original = controller.getState().scenario;
    let changedController: ScenarioController | undefined;
    for (const fixture of defaultTournament.fixtures.filter((entry) => entry.stage === "pool")) {
      const candidate = createScenarioController(original);
      candidate.update(fixture.id, { winner: "away" });
      if (Object.keys(candidate.getState().scenario.predictions).length < Object.keys(original.predictions).length) { changedController = candidate; break; }
    }
    expect(changedController).toBeDefined();
    const changed = changedController!.getState().scenario;
    expect(changedController!.getState().notice).toContain("teams changed");
    changedController!.undo();
    expect(changedController!.getState().scenario).toEqual(original);
    changedController!.redo();
    expect(changedController!.getState().scenario).toEqual(changed);
  });

  it("retains dormant bracket picks through a transient pool conflict and restores them on correction", () => {
    const controller = createScenarioController();
    pickPools(controller);
    pickBracket(controller);
    const original = controller.getState().scenario;
    const originalResult = original.resolved![firstPool];
    controller.update(firstPool, { homeScore: 0, awayScore: 10 }, "score-edit");
    expect(controller.getState().derived.poolsComplete).toBe(false);
    const bracketIds = defaultTournament.fixtures.filter((fixture) => fixture.stage !== "pool").map((fixture) => fixture.id);
    for (const id of bracketIds) expect(controller.getState().scenario.predictions[id]).toEqual(original.predictions[id]);
    controller.update(firstPool, { homeScore: originalResult.homeScore, awayScore: originalResult.awayScore }, "score-edit");
    expect(controller.getState().derived.poolsComplete).toBe(true);
    for (const id of bracketIds) {
      expect(controller.getState().scenario.predictions[id]).toEqual(original.predictions[id]);
      expect(controller.getState().scenario.resolved?.[id]).toEqual(original.resolved?.[id]);
    }
    controller.undo();
    expect(controller.getState().scenario).toEqual(original);
  });

  it("shares conflicts as intent without inconsistent pinned outcomes", () => {
    const controller = createScenarioController();
    controller.update(firstPool, { winner: "home", homeScore: 0, awayScore: 10 });
    expect(controller.getState().scenario.resolved?.[firstPool]).toBeUndefined();
    expect(controller.getState().derived.fixtures.find((fixture) => fixture.id === firstPool)!.issues).toContain("The chosen winner conflicts with the scores.");
    const imported = createScenarioController(decodeScenario(encodeScenario(controller.getState().scenario)));
    expect(imported.getState().scenario.predictions[firstPool].intent).toEqual({ winner: "home", homeScore: 0, awayScore: 10 });
    expect(imported.getState().derived.fixtures.find((fixture) => fixture.id === firstPool)!.issues).toContain("The chosen winner conflicts with the scores.");
  });

  it("rejects invalid IDs/values and unresolved knockout picks without mutating state", () => {
    const controller = createScenarioController();
    const before = controller.getState();
    expect(() => controller.update(99, { winner: "home" })).toThrow();
    expect(() => controller.update(firstPool, { homeScore: 256 })).toThrow();
    expect(() => controller.update(37, { advancing: "home" })).toThrow();
    expect(controller.getState()).toBe(before);
    expect(() => createScenarioController({ ...emptyScenario(), datasetVersion: "another" })).toThrow();
  });

  it.each(["rwc2027", "rwc2023"] as const)("fills every eligible %s fixture, including bronze, in one reversible publication", (tournamentId) => {
    const controller = createScenarioController(emptyScenario(tournamentId));
    const before = controller.getState().scenario;
    const published = vi.fn();
    controller.subscribe(published);
    fillFromRankings(controller);
    const filled = controller.getState().scenario;
    const total = tournamentId === "rwc2027" ? 52 : 48;
    expect(published).toHaveBeenCalledOnce();
    expect(Object.keys(filled.predictions)).toHaveLength(total);
    expect(Object.keys(filled.resolved!)).toHaveLength(total);
    expect(controller.getState().derived.poolsComplete).toBe(true);
    expect(controller.getState().derived.fixtures.every((fixture) => fixture.result && fixture.issues.length === 0)).toBe(true);
    for (const fixture of controller.getState().derived.fixtures) {
      expect(Object.keys(fixture.prediction!.intent)).toEqual([fixture.stage === "pool" ? "winner" : "advancing"]);
      if (fixture.stage !== "pool") expect(fixture.prediction!.participants).toEqual([fixture.homeTeam!.id, fixture.awayTeam!.id]);
    }
    expect(controller.getState().notice).toBe(`${total} matches filled from world rankings.`);
    const completedState = controller.getState();
    fillFromRankings(controller);
    expect(controller.getState()).toBe(completedState);
    expect(published).toHaveBeenCalledOnce();
    controller.undo();
    expect(controller.getState().scenario).toEqual(before);
    expect(controller.getState().canUndo).toBe(false);
    controller.redo();
    expect(controller.getState().scenario).toEqual(filled);
    expect(createScenarioController(decodeScenario(encodeScenario(filled))).getState().scenario).toEqual(filled);
  });

  it("preserves existing explicit choices and custom or partial completed outcomes when filling gaps", () => {
    const controller = createScenarioController();
    controller.update(1, { winner: "away", homeScore: 3, awayScore: 33, homeTries: 0, awayTries: 4 });
    controller.update(2, { awayLosingBonus: false });
    const before = controller.getState().scenario;
    fillFromRankings(controller);
    const after = controller.getState().scenario;
    for (const id of [1, 2]) {
      expect(after.predictions[id]).toEqual(before.predictions[id]);
      expect(after.resolved![id]).toEqual(before.resolved![id]);
    }
    expect(Object.keys(after.resolved!)).toHaveLength(52);
    controller.undo();
    expect(controller.getState().scenario).toEqual(before);
    controller.update(3, { winner: "away" });
    expect(controller.getState().canRedo).toBe(false);
  });

  it("leaves conflicting intent visible and does not invent unresolved knockout participants", () => {
    const controller = createScenarioController();
    controller.update(1, { winner: "home", homeScore: 0, awayScore: 10 });
    const conflicted = controller.getState().scenario.predictions[1];
    fillFromRankings(controller);
    expect(controller.getState().scenario.predictions[1]).toEqual(conflicted);
    expect(controller.getState().scenario.resolved![1]).toBeUndefined();
    expect(Object.keys(controller.getState().scenario.predictions)).toHaveLength(36);
    expect(Object.keys(controller.getState().scenario.resolved!)).toHaveLength(35);
    expect(controller.getState().derived.poolsComplete).toBe(false);
    expect(controller.getState().notice).toBe("35 matches filled from world rankings. 1 conflicting match still needs your attention.");
    const blocked = controller.getState();
    fillFromRankings(controller);
    expect(controller.getState()).toBe(blocked);
  });

  it("keeps a drawn knockout without advancement unresolved while filling other eligible branches", () => {
    const controller = createScenarioController();
    pickPools(controller);
    controller.update(37, { homeScore: 20, awayScore: 20 });
    const drawn = controller.getState().scenario.predictions[37];
    fillFromRankings(controller);
    const fixture = controller.getState().derived.fixtures.find((entry) => entry.id === 37)!;
    expect(fixture.prediction).toEqual(drawn);
    expect(fixture.issues).toContain("Choose which team advances after the drawn score.");
    expect(fixture.result?.advancing).toBeUndefined();
    expect(controller.getState().scenario.resolved![37]).toBeUndefined();
    const directDescendants = controller.getState().derived.fixtures.filter((entry) =>
      [entry.home, entry.away].some((source) => (source.kind === "winner" || source.kind === "loser") && source.fixtureId === 37));
    expect(directDescendants.length).toBeGreaterThan(0);
    expect(directDescendants.every((entry) => !entry.prediction && !entry.result)).toBe(true);
    expect(controller.getState().derived.fixtures.some((entry) => entry.stage !== "pool" && entry.id !== 37 && entry.result && !entry.issues.length)).toBe(true);
  });

  it("keeps the existing completion profile and manual defaults when applying a ranking batch", () => {
    const controller = createScenarioController(emptyScenario("rwc2027"));
    controller.update(1, { winner: "home" });
    const before = controller.getState().scenario;
    expect(before.resolved![1].homeScore).toBe(24);
    fillFromRankings(controller);
    const ranked = controller.getState().scenario;
    expect(ranked.completionVersion).toBe(before.completionVersion);
    expect(ranked.predictions[1]).toEqual(before.predictions[1]);
    expect(ranked.resolved![1]).toEqual(before.resolved![1]);
    expect(createScenarioController(decodeScenario(encodeScenario(ranked))).getState().scenario).toEqual(ranked);
    controller.undo();
    expect(controller.getState().scenario).toEqual(before);
    controller.redo();
    controller.update(1, { winner: "away" });
    expect(controller.getState().scenario.resolved![1]).toMatchObject({ homeScore: 17, awayScore: 24, winner: "away" });

    const complete = createScenarioController(emptyScenario("rwc2027"));
    pickPools(complete); pickBracket(complete);
    const unchanged = complete.getState();
    fillFromRankings(complete);
    expect(complete.getState()).toBe(unchanged);
    expect(complete.getState().scenario.completionVersion).toBe("defaults-v1");
  });

  it("restores dormant knockout pins when filling a missing pool result keeps the same participants", () => {
    const controller = createScenarioController();
    fillFromRankings(controller);
    const complete = controller.getState().scenario;
    controller.update(1, { winner: undefined });
    const dormant = controller.getState().scenario;
    expect(controller.getState().derived.poolsComplete).toBe(false);
    for (const fixture of controller.getState().derived.fixtures.filter((entry) => entry.stage !== "pool")) {
      expect(dormant.predictions[fixture.id]).toEqual(complete.predictions[fixture.id]);
      expect(dormant.resolved![fixture.id]).toEqual(complete.resolved![fixture.id]);
    }
    fillFromRankings(controller);
    expect(controller.getState().scenario).toEqual(complete);
    expect(controller.getState().notice).toBe("1 match filled from world rankings.");
    controller.undo();
    expect(controller.getState().scenario).toEqual(dormant);
  });

  it("replaces newly incompatible dormant knockout picks and fills their descendants in the same action", () => {
    const original = createScenarioController(emptyScenario("rwc2027"));
    pickPools(original); pickBracket(original);
    const complete = original.getState().scenario;
    let replacement: ReturnType<typeof createScenarioController> | undefined;
    let beforeFill: typeof complete | undefined;
    for (const fixture of defaultTournament.fixtures.filter((entry) => entry.stage === "pool")) {
      const candidate = createScenarioController(complete);
      candidate.update(fixture.id, { winner: undefined });
      const dormant = candidate.getState().scenario;
      fillFromRankings(candidate);
      const changedBinding = candidate.getState().derived.fixtures.some((entry) => entry.stage !== "pool" &&
        JSON.stringify(entry.prediction?.participants) !== JSON.stringify(complete.predictions[entry.id].participants));
      if (changedBinding) { replacement = candidate; beforeFill = dormant; break; }
    }
    expect(replacement).toBeDefined();
    const afterFill = replacement!.getState().scenario;
    expect(Object.keys(afterFill.predictions)).toHaveLength(52);
    expect(Object.keys(afterFill.resolved!)).toHaveLength(52);
    expect(replacement!.getState().derived.fixtures.every((fixture) => fixture.result && fixture.issues.length === 0)).toBe(true);
    expect(replacement!.getState().notice).toContain("replaced because the teams changed");
    replacement!.undo();
    expect(replacement!.getState().scenario).toEqual(beforeFill);
    replacement!.redo();
    expect(replacement!.getState().scenario).toEqual(afterFill);
  });
  it("rejects invalid batches atomically and does not publish or change undo history", () => {
    const controller = createScenarioController();
    const before = controller.getState();
    const published = vi.fn();
    controller.subscribe(published);
    const valid = planRankingFill(before.scenario).updates;
    for (const invalid of [
      [...valid, valid[0]],
      [...valid.slice(0, -1), { ...valid.at(-1)!, fixtureId: 99 }],
      [{ ...valid[0], result: { ...valid[0].result, homeScore: 256 } }],
      [{ ...valid[0], result: { ...valid[0].result, homeTries: 15 } }],
      [{ ...valid[0], result: { ...valid[0].result, winner: "away" as const } }],
      [...valid.slice(0, -1), { ...valid.at(-1)!, participants: undefined }],
      [...valid.slice(0, -1), { ...valid.at(-1)!, participants: ["au", "hk"] as [string, string] }],
    ]) {
      expect(() => controller.applyBatch(invalid)).toThrow();
      expect(controller.getState()).toBe(before);
    }
    expect(published).not.toHaveBeenCalled();
    controller.applyBatch([]);
    expect(controller.getState()).toBe(before);
  });

  it("owns batch inputs, accepts an unordered batch and starts one action after a grouped edit", () => {
    const controller = createScenarioController();
    controller.update(1, { winner: "home" }, "details");
    controller.update(1, { margin: 3 }, "details");
    const before = controller.getState().scenario;
    const updates = planRankingFill(before).updates.reverse();
    controller.applyBatch(updates);
    const filled = controller.getState().scenario;
    updates[0].intent.advancing = "away";
    updates[0].participants![0] = "unknown";
    updates[0].result.homeScore = 0;
    expect(controller.getState().scenario).toBe(filled);
    expect(createScenarioController(decodeScenario(encodeScenario(filled))).getState().scenario).toEqual(filled);
    controller.undo();
    expect(controller.getState().scenario).toEqual(before);
    controller.undo();
    expect(controller.getState().scenario.predictions).toEqual({});
  });
});
