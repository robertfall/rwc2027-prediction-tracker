import { completePrediction, completionIssues } from "./completion";
import { calculateStandings, compareThirds } from "./standings";
import { thirdPlaceAssignments } from "./third-place";
import { getTournament } from "./tournaments";
import type { DerivedScenario, Fixture, ResolvedFixture, Scenario, Team, TeamSource } from "./types";

export function deriveScenario(scenario: Scenario): DerivedScenario {
  const tournament = getTournament(scenario.tournamentId);
  if (scenario.datasetVersion !== tournament.datasetVersion || scenario.rulesVersion !== tournament.rulesVersion) {
    throw new Error("This scenario uses an unsupported tournament dataset or rules version.");
  }
  const teams = new Map(tournament.teams.map((team) => [team.id, team]));
  const resolved = new Map<number, ResolvedFixture>();
  function complete(fixture: Fixture, homeTeam?: Team, awayTeam?: Team): ResolvedFixture {
    const prediction = scenario.predictions[fixture.id];
    const item: ResolvedFixture = { ...fixture, homeTeam, awayTeam, prediction, issues: [] };
    if (!prediction || !homeTeam || !awayTeam) return item;
    if (prediction.participants && (prediction.participants[0] !== homeTeam.id || prediction.participants[1] !== awayTeam.id)) {
      item.issues = ["The teams in this fixture changed. Choose an outcome for the new matchup."];
      return item;
    }
    const completion = completePrediction(prediction.intent, fixture, tournament, homeTeam, awayTeam);
    item.result = completion.result ? (scenario.resolved?.[fixture.id] ?? completion.result) : undefined;
    item.issues = item.result
      ? completionIssues(prediction.intent, fixture, item.result, homeTeam, awayTeam)
      : completion.issues;
    return item;
  }
  const poolFixtures = tournament.fixtures.filter((fixture) => fixture.stage === "pool").map((fixture) => {
    const homeTeam = fixture.home.kind === "team" ? teams.get(fixture.home.teamId) : undefined;
    const awayTeam = fixture.away.kind === "team" ? teams.get(fixture.away.teamId) : undefined;
    const item = complete(fixture, homeTeam, awayTeam);
    resolved.set(fixture.id, item);
    return item;
  });
  const standings = calculateStandings(tournament, poolFixtures);
  const poolsComplete = poolFixtures.every((fixture) => fixture.result && fixture.issues.length === 0);
  const bestThirds = poolsComplete && tournament.id === "rwc2027"
    ? tournament.pools.map((pool) => ({ pool: pool.id, row: standings[pool.id][2] }))
      .sort((a, b) => compareThirds(a.row, b.row, tournament)).slice(0, 4)
    : [];
  const qualifiedThirdPools = bestThirds.map((third) => third.pool);
  const assignments = thirdPlaceAssignments(qualifiedThirdPools);
  function resolveTeam(source: TeamSource): Team | undefined {
    if (source.kind === "team") return teams.get(source.teamId);
    if (source.kind === "pool") {
      return poolsComplete ? teams.get(standings[source.pool]?.[source.position - 1]?.teamId) : undefined;
    }
    if (source.kind === "third") {
      const pool = assignments?.[source.againstPool];
      return pool ? teams.get(standings[pool][2].teamId) : undefined;
    }
    const previous = resolved.get(source.fixtureId);
    if (!previous?.result || previous.issues.length > 0) return undefined;
    const winner = previous.result.advancing ?? (previous.result.winner === "draw" ? undefined : previous.result.winner);
    if (!winner) return undefined;
    const side = source.kind === "winner" ? winner : winner === "home" ? "away" : "home";
    return side === "home" ? previous.homeTeam : previous.awayTeam;
  }
  for (const fixture of tournament.fixtures.filter((fixture) => fixture.stage !== "pool")) {
    const item = complete(fixture, resolveTeam(fixture.home), resolveTeam(fixture.away));
    resolved.set(fixture.id, item);
  }
  return {
    tournament, fixtures: tournament.fixtures.map((fixture) => resolved.get(fixture.id)!),
    standings, qualifiedThirdPools, poolsComplete,
  };
}
