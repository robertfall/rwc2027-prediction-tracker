import type { DerivedScenario, PredictionIntent, PredictionUpdate, Scenario } from "../domain/types";
import { validateIntent } from "../domain/completion";
import { deriveScenario } from "../domain/derive";
import { reconcileScenario as reconcile } from "../domain/reconcile";
import { defaultTournament, getTournament } from "../domain/tournaments";
import { validateScenario } from "./codec";

export interface ControllerState {
  scenario: Scenario;
  derived: DerivedScenario;
  canUndo: boolean;
  canRedo: boolean;
  notice?: string;
}
export interface ScenarioController {
  getState: () => ControllerState;
  subscribe: (listener: () => void) => () => void;
  update: (fixtureId: number, patch: Partial<PredictionIntent>, group?: string) => void;
  applyBatch: (updates: readonly PredictionUpdate[], notice?: string) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  finishGroup: () => void;
  importScenario: (scenario: Scenario) => void;
}

export function emptyScenario(tournamentId = defaultTournament.id): Scenario {
  const tournament = getTournament(tournamentId);
  return {
    schemaVersion: 2,
    tournamentId: tournament.id,
    datasetVersion: tournament.datasetVersion,
    rulesVersion: tournament.rulesVersion,
    completionVersion: "defaults-v1",
    predictions: {},
    resolved: {},
  };
}

function copy<T>(value: T): T { return structuredClone(value); }

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

export function createScenarioController(initial: Scenario = emptyScenario()): ScenarioController {
  validateScenario(initial);
  let current = reconcile(copy(initial));
  freeze(current.scenario);
  let state: ControllerState = { scenario: current.scenario, derived: current.derived, canUndo: false, canRedo: false };
  const listeners = new Set<() => void>();
  const past: Scenario[] = [];
  const future: Scenario[] = [];
  let activeGroup: string | undefined;

  function publish(notice?: string): void {
    state = { scenario: current.scenario, derived: current.derived, canUndo: past.length > 0, canRedo: future.length > 0, ...(notice ? { notice } : {}) };
    for (const listener of listeners) listener();
  }

  function commitUpdated(updated: ReturnType<typeof reconcile>, group?: string, notice?: string): void {
    if (JSON.stringify(updated.scenario) === JSON.stringify(current.scenario)) return;
    if (!group || activeGroup !== group) past.push(current.scenario);
    // Keep local history finite; each snapshot contains the complete atomic action.
    if (past.length > 200) past.shift();
    future.length = 0;
    activeGroup = group;
    current = updated;
    freeze(current.scenario);
    publish(notice ?? (updated.cleared ? `${updated.cleared} dependent ${updated.cleared === 1 ? "pick was" : "picks were"} cleared because the teams changed.` : undefined));
  }

  function commit(next: Scenario, group?: string, notice?: string): void {
    commitUpdated(reconcile(next), group, notice);
  }

  return {
    getState: () => state,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    update: (fixtureId, patch, group) => {
      validateIntent(patch, true);
      const fixture = state.derived.fixtures.find((entry) => entry.id === fixtureId);
      if (!fixture) throw new RangeError("This match is outside the selected tournament.");
      if (fixture.stage !== "pool" && (!fixture.homeTeam || !fixture.awayTeam)) throw new RangeError("Choose the earlier results before this knockout match.");
      const next = copy(current.scenario);
      const intent = { ...next.predictions[fixtureId]?.intent };
      for (const [field, value] of Object.entries(patch)) {
        const key = field as keyof PredictionIntent;
        if (value === undefined) delete intent[key];
        else Object.assign(intent, { [key]: value });
      }
      if (Object.keys(intent).length) {
        next.predictions[fixtureId] = {
          intent,
          ...(fixture.stage !== "pool" && fixture.homeTeam && fixture.awayTeam ? { participants: [fixture.homeTeam.id, fixture.awayTeam.id] as [string, string] } : {}),
        };
      } else delete next.predictions[fixtureId];
      delete next.resolved?.[fixtureId];
      commit(next, group);
    },
    applyBatch: (updates, notice) => {
      if (!updates.length) return;
      const next = copy(current.scenario);
      next.resolved ??= {};
      const expectedPredictions = new Map<number, string>();
      for (const update of updates) {
        const fixture = current.derived.fixtures.find((entry) => entry.id === update.fixtureId);
        if (!fixture || expectedPredictions.has(update.fixtureId)) throw new RangeError("Batch contains an invalid or repeated match.");
        if (!update.result || (fixture.stage !== "pool" && !update.participants)) throw new RangeError("Batch results require complete outcomes and bound knockout participants.");
        const prediction = copy({ intent: update.intent, ...(update.participants ? { participants: update.participants } : {}) });
        const result = copy(update.result);
        // Validate each supplied record before reconciliation can discard a bad
        // outcome. Knockout parents may be provided later in this same batch.
        validateScenario({ ...emptyScenario(next.tournamentId), predictions: { [update.fixtureId]: prediction }, resolved: { [update.fixtureId]: result } });
        expectedPredictions.set(update.fixtureId, JSON.stringify(prediction));
        next.predictions[update.fixtureId] = prediction;
        next.resolved[update.fixtureId] = result;
      }
      const updated = reconcile(next);
      for (const update of updates) {
        if (JSON.stringify(updated.scenario.predictions[update.fixtureId]) !== expectedPredictions.get(update.fixtureId) ||
          JSON.stringify(updated.scenario.resolved?.[update.fixtureId]) !== JSON.stringify(update.result)) {
          throw new RangeError("Batch contains an incompatible matchup or outcome.");
        }
      }
      validateScenario(updated.scenario);
      commitUpdated(updated, undefined, notice);
    },
    finishGroup: () => { activeGroup = undefined; },
    undo: () => {
      const previous = past.pop();
      if (!previous) return;
      future.push(current.scenario);
      activeGroup = undefined;
      current = { scenario: previous, derived: deriveScenario(previous), cleared: 0 };
      publish();
    },
    redo: () => {
      const next = future.pop();
      if (!next) return;
      past.push(current.scenario);
      activeGroup = undefined;
      current = { scenario: next, derived: deriveScenario(next), cleared: 0 };
      publish();
    },
    reset: () => { activeGroup = undefined; commit(emptyScenario(current.scenario.tournamentId)); },
    importScenario: (scenario) => {
      validateScenario(scenario);
      current = reconcile(copy(scenario));
      freeze(current.scenario);
      past.length = 0;
      future.length = 0;
      activeGroup = undefined;
      publish();
    },
  };
}
