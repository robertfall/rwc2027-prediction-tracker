import { deriveScenario } from "./derive";
import type { DerivedScenario, Scenario } from "./types";

function copy<T>(value: T): T { return structuredClone(value); }

/** Reconcile a mutable snapshot's dependent participant changes and saved outcomes. */
export function reconcileScenario(scenario: Scenario): { scenario: Scenario; derived: DerivedScenario; cleared: number } {
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
