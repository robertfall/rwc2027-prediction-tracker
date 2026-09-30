import type { ResolvedFixture, Standing, Tournament } from "./types";

export function emptyStanding(teamId: string): Standing {
  return {
    teamId, played: 0, wins: 0, draws: 0, losses: 0, points: 0,
    pointsFor: 0, pointsAgainst: 0, triesFor: 0, triesAgainst: 0,
    tryBonuses: 0, losingBonuses: 0,
  };
}

function headToHeadWinner(a: string, b: string, fixtures: ResolvedFixture[]): string | undefined {
  const fixture = fixtures.find((fixture) => fixture.issues.length === 0 && fixture.result
    && ((fixture.homeTeam?.id === a && fixture.awayTeam?.id === b)
      || (fixture.homeTeam?.id === b && fixture.awayTeam?.id === a)));
  if (!fixture?.result || fixture.result.winner === "draw") return undefined;
  return fixture.result.winner === "home" ? fixture.homeTeam?.id : fixture.awayTeam?.id;
}

/** Pick one place at a time, restarting the criteria for the remaining tied teams. */
export function rankPool(rows: Standing[], fixtures: ResolvedFixture[], tournament: Tournament): Standing[] {
  const ordered: Standing[] = [];
  const points = [...new Set(rows.map((row) => row.points))].sort((a, b) => b - a);
  const criteria = [
    (row: Standing) => row.pointsFor - row.pointsAgainst,
    (row: Standing) => row.triesFor - row.triesAgainst,
    (row: Standing) => row.pointsFor,
    (row: Standing) => row.triesFor,
    (row: Standing) => -(tournament.rankings[row.teamId] ?? Number.MAX_SAFE_INTEGER),
  ];
  for (const pointTotal of points) {
    let remaining = rows.filter((row) => row.points === pointTotal);
    while (remaining.length > 0) {
      let candidates = remaining;
      if (candidates.length === 2) {
        const winner = headToHeadWinner(candidates[0].teamId, candidates[1].teamId, fixtures);
        if (winner) candidates = candidates.filter((row) => row.teamId === winner);
      }
      for (const criterion of criteria) {
        if (candidates.length <= 1) break;
        const highest = Math.max(...candidates.map(criterion));
        candidates = candidates.filter((row) => criterion(row) === highest);
      }
      const highest = [...candidates].sort((a, b) => a.teamId.localeCompare(b.teamId))[0];
      ordered.push(highest);
      remaining = remaining.filter((row) => row !== highest);
    }
  }
  return ordered;
}

export function calculateStandings(tournament: Tournament, fixtures: ResolvedFixture[]): Record<string, Standing[]> {
  return Object.fromEntries(tournament.pools.map((pool) => {
    const rows = new Map(pool.teamIds.map((id) => [id, emptyStanding(id)]));
    const poolFixtures = fixtures.filter((fixture) => fixture.stage === "pool" && fixture.pool === pool.id);
    for (const fixture of poolFixtures) {
      if (!fixture.result || fixture.issues.length > 0 || !fixture.homeTeam || !fixture.awayTeam) continue;
      const home = rows.get(fixture.homeTeam.id);
      const away = rows.get(fixture.awayTeam.id);
      if (!home || !away) continue;
      const result = fixture.result;
      for (const [row, score, conceded, tries, triesConceded, won] of [
        [home, result.homeScore, result.awayScore, result.homeTries, result.awayTries, result.winner === "home"],
        [away, result.awayScore, result.homeScore, result.awayTries, result.homeTries, result.winner === "away"],
      ] as const) {
        row.played++;
        row.pointsFor += score;
        row.pointsAgainst += conceded;
        row.triesFor += tries;
        row.triesAgainst += triesConceded;
        const draw = result.winner === "draw";
        if (won) row.wins++;
        else if (draw) row.draws++;
        else row.losses++;
        const tryBonus = tries >= 4 ? 1 : 0;
        const losingBonus = !won && !draw && conceded - score <= 7 ? 1 : 0;
        row.tryBonuses += tryBonus;
        row.losingBonuses += losingBonus;
        row.points += (won ? 4 : draw ? 2 : 0) + tryBonus + losingBonus;
      }
    }
    return [pool.id, rankPool([...rows.values()], poolFixtures, tournament)];
  }));
}

/** The later official 2027 explainer's cross-pool third-place criteria. */
export function compareThirds(a: Standing, b: Standing, tournament: Tournament): number {
  return b.points - a.points
    || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)
    || b.pointsFor - a.pointsFor
    || b.triesFor - a.triesFor
    || (tournament.rankings[a.teamId] ?? Number.MAX_SAFE_INTEGER) - (tournament.rankings[b.teamId] ?? Number.MAX_SAFE_INTEGER)
    || a.teamId.localeCompare(b.teamId);
}
