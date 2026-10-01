import { rankingProjection } from "./rankings";
import { reconcileScenario } from "./reconcile";
import type { CompletedResult, PredictionUpdate, Scenario } from "./types";

export interface RankingFillPlan {
  updates: PredictionUpdate[];
  conflicts: number;
  cleared: number;
}

/** Plan a complete tournament locally; applying the plan is one separate state action. */
export function planRankingFill(scenario: Scenario): RankingFillPlan {
  const next = structuredClone(scenario);
  const updates: PredictionUpdate[] = [];
  let cleared = 0;
  let intermediate = reconcileScenario(next);
  // Each pass fills only currently known matchups. The next pass resolves their
  // descendants and removes any saved picks proved incompatible by the new teams.
  for (let pass = 0; pass <= intermediate.derived.fixtures.length; pass++) {
    cleared += intermediate.cleared;
    let added = 0;
    for (const fixture of intermediate.derived.fixtures) {
      if (next.predictions[fixture.id] || !fixture.homeTeam || !fixture.awayTeam) continue;
      const projection = rankingProjection(intermediate.derived.tournament, fixture.homeTeam, fixture.awayTeam);
      const advancing = fixture.stage !== "pool" ? projection.winner === "draw" ? "home" : projection.winner : undefined;
      const result: CompletedResult = {
        ...projection,
        homeTries: Math.min(15, Math.floor(projection.homeScore / 7)),
        awayTries: Math.min(15, Math.floor(projection.awayScore / 7)),
        ...(advancing ? { advancing } : {}),
      };
      const update: PredictionUpdate = {
        fixtureId: fixture.id,
        intent: advancing ? { advancing } : { winner: projection.winner },
        ...(advancing ? { participants: [fixture.homeTeam.id, fixture.awayTeam.id] as [string, string] } : {}),
        result,
      };
      next.predictions[fixture.id] = { intent: update.intent, ...(update.participants ? { participants: update.participants } : {}) };
      next.resolved![fixture.id] = result;
      updates.push(update);
      added++;
    }
    if (!added) return {
      updates, cleared,
      conflicts: intermediate.derived.fixtures.filter((fixture) => fixture.issues.length > 0).length,
    };
    intermediate = reconcileScenario(next);
  }
  throw new Error("Ranking fill did not finish resolving the tournament.");
}
