import { describe, expect, it } from "vitest";
import { createScenarioController, emptyScenario, type ScenarioController } from "./controller";
import { defaultTournament } from "../domain/tournaments";
import { decodeScenario, encodeScenario } from "./codec";

function pickPools(controller: ScenarioController): void {
  for (const fixture of controller.getState().derived.fixtures.filter((entry) => entry.stage === "pool")) controller.update(fixture.id, { winner: "home" });
}
function pickBracket(controller: ScenarioController): void {
  for (const fixture of controller.getState().derived.fixtures.filter((entry) => entry.stage !== "pool")) controller.update(fixture.id, { advancing: "home" });
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
});
