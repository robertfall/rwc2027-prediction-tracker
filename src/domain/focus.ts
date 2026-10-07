import { thirdPlaceAssignments } from "./third-place";
import type { DerivedScenario, ResolvedFixture, Side, TeamSource } from "./types";

export interface TeamFocus {
  fixtureIds: ReadonlySet<number>;
  poolIds: ReadonlySet<string>;
}

function advancingSide(fixture: ResolvedFixture): Side | undefined {
  if (!fixture.result || fixture.issues.length || !fixture.homeTeam || !fixture.awayTeam) return undefined;
  return fixture.result.advancing ?? (fixture.result.winner === "draw" ? undefined : fixture.result.winner);
}

/** Possible official bracket slots for a third from this pool, without solving qualification. */
function thirdSlots(derived: DerivedScenario, poolId: string): Set<string> {
  const slots = new Set<string>();
  if (derived.tournament.id !== "rwc2027") return slots;
  const pools = derived.tournament.pools.map((pool) => pool.id);
  function choose(start: number, selected: string[]): void {
    if (selected.length === 4) {
      if (!selected.includes(poolId)) return;
      for (const [againstPool, thirdPool] of Object.entries(thirdPlaceAssignments(selected) ?? {})) {
        if (thirdPool === poolId) slots.add(againstPool);
      }
      return;
    }
    for (let index = start; index < pools.length; index++) choose(index + 1, [...selected, pools[index]]);
  }
  choose(0, []);
  return slots;
}

/**
 * Follow the current prediction, keeping open routes and unresolved opponent feeders.
 * This is a view filter. It does not establish qualification or search other score scenarios.
 */
export function deriveTeamFocus(derived: DerivedScenario, teamId?: string): TeamFocus {
  const ownPool = derived.tournament.pools.find((pool) => pool.teamIds.includes(teamId ?? ""));
  if (!ownPool || !teamId) {
    return { fixtureIds: new Set(derived.fixtures.map((fixture) => fixture.id)),
      poolIds: new Set(derived.tournament.pools.map((pool) => pool.id)) };
  }
  const ownPoolId = ownPool.id;
  const fixtureIds = new Set<number>();
  const poolIds = new Set([ownPoolId]);
  const ownPoolFixtures = derived.fixtures.filter((fixture) => fixture.pool === ownPoolId);
  const ownPoolComplete = ownPoolFixtures.every((fixture) => fixture.result && fixture.issues.length === 0);
  const position = derived.standings[ownPoolId]?.findIndex((row) => row.teamId === teamId) ?? -1;
  if (derived.tournament.id === "rwc2027" && ownPoolComplete && position === 2) {
    for (const pool of derived.tournament.pools) poolIds.add(pool.id);
  }
  for (const fixture of derived.fixtures) {
    if (fixture.pool && poolIds.has(fixture.pool)) fixtureIds.add(fixture.id);
  }

  const byId = new Map(derived.fixtures.map((fixture) => [fixture.id, fixture]));
  const next = new Map<number, { fixture: ResolvedFixture; side: Side; kind: "winner" | "loser" }[]>();
  for (const fixture of derived.fixtures) {
    for (const side of ["home", "away"] as const) {
      const source = fixture[side];
      if (source.kind !== "winner" && source.kind !== "loser") continue;
      const edges = next.get(source.fixtureId) ?? [];
      edges.push({ fixture, side, kind: source.kind });
      next.set(source.fixtureId, edges);
    }
  }
  const feederSeen = new Set<number>();
  function includeFeeder(source: TeamSource): void {
    if (source.kind !== "winner" && source.kind !== "loser") return;
    const fixture = byId.get(source.fixtureId);
    if (!fixture || advancingSide(fixture)) return;
    fixtureIds.add(fixture.id);
    if (feederSeen.has(fixture.id)) return;
    feederSeen.add(fixture.id);
    includeFeeder(fixture.home);
    includeFeeder(fixture.away);
  }
  const routeSeen = new Set<string>();
  function follow(fixture: ResolvedFixture, side: Side): void {
    const key = `${fixture.id}:${side}`;
    if (routeSeen.has(key)) return;
    routeSeen.add(key);
    fixtureIds.add(fixture.id);
    includeFeeder(fixture[side === "home" ? "away" : "home"]);
    const advancing = advancingSide(fixture);
    const routeKind = advancing ? advancing === side ? "winner" : "loser" : undefined;
    for (const edge of next.get(fixture.id) ?? []) {
      if (!routeKind || edge.kind === routeKind) follow(edge.fixture, edge.side);
    }
  }
  const possibleThirdSlots = derived.poolsComplete ? new Set<string>() : thirdSlots(derived, ownPoolId);
  function possibleStart(source: TeamSource): boolean {
    if (source.kind === "pool" && source.pool === ownPoolId) {
      return !ownPoolComplete || source.position === position + 1;
    }
    return source.kind === "third" && possibleThirdSlots.has(source.againstPool)
      && (!ownPoolComplete || position === 2);
  }
  for (const fixture of derived.fixtures) {
    if (fixture.stage === "pool") continue;
    for (const side of ["home", "away"] as const) {
      if (derived.poolsComplete ? fixture[`${side}Team`]?.id === teamId : possibleStart(fixture[side])) follow(fixture, side);
    }
  }
  return { fixtureIds, poolIds };
}
