import type { CompletionVersion, DerivedScenario, PredictionIntent, Scenario } from "../domain/types";
import { validateIntent } from "../domain/completion";
import { deriveScenario } from "../domain/derive";
import { rankingProjection } from "../domain/rankings";
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
  fillFromRankings: () => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  finishGroup: () => void;
  importScenario: (scenario: Scenario) => void;
}

export function emptyScenario(tournamentId = defaultTournament.id, completionVersion: CompletionVersion = "rankings-v1"): Scenario {
  const tournament = getTournament(tournamentId);
  return {
    schemaVersion: 2,
    tournamentId: tournament.id,
    datasetVersion: tournament.datasetVersion,
    rulesVersion: tournament.rulesVersion,
    completionVersion,
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

/** Reconcile all dependent participant changes inside the same historical action. */
function reconcile(scenario: Scenario): { scenario: Scenario; derived: DerivedScenario; cleared: number } {
  let derived = deriveScenario(scenario);
  let cleared = 0;
  for (let pass = 0; pass < derived.fixtures.length; pass++) {
    let changed = false;
    for (const fixture of derived.fixtures) {
      if (fixture.stage === "pool") continue;
      const prediction = scenario.predictions[fixture.id];
      if (!prediction) continue;
      const participants = fixture.homeTeam && fixture.awayTeam ? [fixture.homeTeam.id, fixture.awayTeam.id] as [string, string] : undefined;
      if (prediction.participants && participants && (prediction.participants[0] !== participants[0] || prediction.participants[1] !== participants[1])) {
        delete scenario.predictions[fixture.id];
        delete scenario.resolved?.[fixture.id];
        cleared++;
        changed = true;
      } else if (!prediction.participants && participants) {
        prediction.participants = participants;
        changed = true;
      }
    }
    if (!changed) break;
    derived = deriveScenario(scenario);
  }
  const previousResolved = scenario.resolved ?? {};
  scenario.resolved = {};
  for (const fixture of derived.fixtures) {
    if (!fixture.prediction) continue;
    if (fixture.result && fixture.issues.length === 0) scenario.resolved[fixture.id] = copy(fixture.result);
    else if (fixture.stage !== "pool" && (!fixture.homeTeam || !fixture.awayTeam) && previousResolved[fixture.id]) {
      // Pending participants do not prove a saved choice incompatible. Keep its pinned
      // outcome dormant so finishing a temporary pool conflict restores the same pick.
      scenario.resolved[fixture.id] = copy(previousResolved[fixture.id]);
    }
  }
  return { scenario, derived: deriveScenario(scenario), cleared };
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

  function commit(next: Scenario, group?: string, notice?: string): void {
    const updated = reconcile(next);
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
    fillFromRankings: () => {
      // Conflicting choices and unresolved descendants are not missing picks.
      // A complete or blocked scenario must not migrate or create undo history.
      if (!current.derived.fixtures.some((fixture) => !fixture.prediction && fixture.homeTeam && fixture.awayTeam)) return;
      const next = copy(current.scenario);
      next.completionVersion = "rankings-v1";
      let filled = 0;
      let cleared = 0;
      for (let pass = 0; pass < current.derived.fixtures.length; pass++) {
        // Filling a previous stage can make dormant bindings incompatible. Clear
        // them before finding the newly eligible fixtures, inside this same action.
        const intermediate = reconcile(next);
        cleared += intermediate.cleared;
        let added = 0;
        for (const fixture of intermediate.derived.fixtures) {
          if (next.predictions[fixture.id] || !fixture.homeTeam || !fixture.awayTeam) continue;
          const winner = rankingProjection(intermediate.derived.tournament, fixture.homeTeam, fixture.awayTeam).winner;
          next.predictions[fixture.id] = {
            intent: fixture.stage === "pool" ? { winner } : { advancing: winner === "draw" ? "home" : winner },
            ...(fixture.stage !== "pool" ? { participants: [fixture.homeTeam.id, fixture.awayTeam.id] as [string, string] } : {}),
          };
          added++;
        }
        filled += added;
        if (!added) break;
      }
      if (!filled) return;
      const conflicts = deriveScenario(next).fixtures.filter((fixture) => fixture.issues.length > 0).length;
      const notice = `${filled} ${filled === 1 ? "match" : "matches"} filled from world rankings.` +
        (cleared ? ` ${cleared} dependent ${cleared === 1 ? "pick was" : "picks were"} replaced because the teams changed.` : "") +
        (conflicts ? ` ${conflicts} conflicting ${conflicts === 1 ? "match still needs" : "matches still need"} your attention.` : "");
      activeGroup = undefined;
      commit(next, undefined, notice);
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
    reset: () => { activeGroup = undefined; commit(emptyScenario(current.scenario.tournamentId, current.scenario.completionVersion)); },
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
