import type { Fixture, ResolvedFixture, Stage, Team, Tournament } from "../domain/types";
import { dateTimeFormat, localDateKey } from "./date-time";

export const stageOrder: Stage[] = ["round16", "quarter", "semi", "bronze", "final"];
export const stageLabels: Record<Stage, string> = {
  pool: "Pools", round16: "Round of 16", quarter: "Quarter-finals",
  semi: "Semi-finals", bronze: "Bronze final", final: "Final",
};

export function isCompleted(fixture: ResolvedFixture): boolean {
  return Boolean(fixture.result && fixture.issues.length === 0);
}

export function placedTeam(fixture: ResolvedFixture | undefined, loser = false): Team | undefined {
  if (!fixture || !isCompleted(fixture)) return undefined;
  const result = fixture.result!;
  const winner = result.advancing ?? (result.winner === "draw" ? undefined : result.winner);
  if (!winner) return undefined;
  const side = loser ? (winner === "home" ? "away" : "home") : winner;
  return side === "home" ? fixture.homeTeam : fixture.awayTeam;
}

export function dateRange(fixtures: Fixture[], timeZone?: string): string {
  if (!fixtures.length) return "";
  const ordered = [...fixtures].sort(byKickoff);
  return dateTimeFormat("date", timeZone).formatRange(new Date(ordered[0].kickoff), new Date(ordered[ordered.length - 1].kickoff));
}

export function byKickoff(a: Fixture, b: Fixture): number {
  return Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.id - b.id;
}

export interface TimelineDay { key: string; kickoff: string; fixtureIds: number[] }
export interface TimelineGroup { key: string; label: string; fixtureIds: number[]; days: TimelineDay[] }

/** Presentation groups only; all results and qualification come from the domain. */
export function timelineGroups(tournament: Tournament, phase: "pools" | "knockout", filter?: string, timeZone?: string): TimelineGroup[] {
  const fixtures = tournament.fixtures.filter((fixture) => phase === "pools" ? fixture.stage === "pool" : fixture.stage !== "pool").sort(byKickoff);
  const groups = new Map<string, TimelineGroup>();
  const appearances = new Map<string, number>();
  for (const fixture of fixtures) {
    let key: string;
    let label: string;
    if (phase === "knockout") {
      key = fixture.stage === "bronze" || fixture.stage === "final" ? "finals" : fixture.stage;
      label = key === "finals" ? "Finals weekend" : stageLabels[fixture.stage];
    } else if (tournament.id === "rwc2027") {
      const teamIds = [fixture.home, fixture.away].flatMap((source) => source.kind === "team" ? [source.teamId] : []);
      const round = Math.max(...teamIds.map((id) => (appearances.get(id) ?? 0) + 1));
      teamIds.forEach((id) => appearances.set(id, (appearances.get(id) ?? 0) + 1));
      key = `round-${round}`;
      label = `Round ${round}`;
    } else {
      // Legacy fixtures have unequal team appearances within calendar weeks.
      const monday = new Date(`${localDateKey(new Date(fixture.kickoff), timeZone)}T00:00:00Z`);
      monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
      key = `week-${monday.toISOString().slice(0, 10)}`;
      label = "Pool matches";
    }
    if (phase === "pools" && filter && filter !== "all" && fixture.pool !== filter) continue;
    let group = groups.get(key);
    if (!group) { group = { key, label, fixtureIds: [], days: [] }; groups.set(key, group); }
    group.fixtureIds.push(fixture.id);
    const dayKey = localDateKey(new Date(fixture.kickoff), timeZone);
    let day = group.days.find((candidate) => candidate.key === dayKey);
    if (!day) { day = { key: dayKey, kickoff: fixture.kickoff, fixtureIds: [] }; group.days.push(day); }
    day.fixtureIds.push(fixture.id);
  }
  return [...groups.values()];
}

/** Follow actual winner sources so adjacent cards feed the next match. */
export function bracketOrder(tournament: Tournament): Map<Stage, number[]> {
  const fixtures = new Map(tournament.fixtures.map((fixture) => [fixture.id, fixture]));
  const order = new Map<Stage, number[]>();
  const visited = new Set<number>();
  function visit(fixture: Fixture): void {
    if (visited.has(fixture.id)) return;
    visited.add(fixture.id);
    for (const source of [fixture.home, fixture.away]) {
      if (source.kind !== "winner") continue;
      const previous = fixtures.get(source.fixtureId);
      if (previous) visit(previous);
    }
    const ids = order.get(fixture.stage) ?? [];
    ids.push(fixture.id);
    order.set(fixture.stage, ids);
  }
  const final = tournament.fixtures.find((fixture) => fixture.stage === "final");
  if (final) visit(final);
  return order;
}

export function progressionNote(fixture: Fixture, tournament: Tournament): string {
  const destinations = tournament.fixtures.flatMap((next) => [next.home, next.away].flatMap((source) =>
    (source.kind === "winner" || source.kind === "loser") && source.fixtureId === fixture.id
      ? [`${source.kind === "winner" ? "Winner" : "Loser"} to ${next.stage === "final" ? "the final" : next.stage === "bronze" ? "the bronze final" : `match ${next.id}`}`]
      : []));
  if (destinations.length) return destinations.join(" · ");
  return fixture.stage === "final" ? "Winner is your champion" : fixture.stage === "bronze" ? "Winner takes bronze" : "";
}
