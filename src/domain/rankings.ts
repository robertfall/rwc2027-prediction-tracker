import { rankingSnapshotData } from "./ranking-data";
import type { Team, Tournament, Winner } from "./types";

export interface RankedTeam {
  readonly teamId: string;
  readonly name: string;
  readonly worldRugbyTeamId: string;
  readonly position: number;
  readonly rating: number;
}

export interface RankingSnapshot {
  readonly id: string;
  readonly effectiveDate: string;
  readonly retrievedAsOf: string;
  readonly source: string;
  readonly label: string;
  readonly rawSha256: string;
  readonly teams: readonly RankedTeam[];
}

export interface RankingProjection {
  homeScore: number;
  awayScore: number;
  winner: Winner;
}

const snapshots = Object.fromEntries(Object.entries(rankingSnapshotData).map(([id, data]) => [
  id, Object.freeze({ ...data, teams: Object.freeze(data.teams.map((team) => Object.freeze({ ...team }))) }),
])) as Record<Tournament["id"], RankingSnapshot>;
const ratings = new Map(Object.entries(snapshots).map(([id, snapshot]) => [
  id, new Map(snapshot.teams.map((team) => [team.teamId, team])),
]));

/** The dated ranking input is separate from the tournament's qualification tie-break ranks. */
export function rankingSnapshot(tournamentId: Tournament["id"]): RankingSnapshot {
  const snapshot = snapshots[tournamentId];
  if (!snapshot) throw new RangeError(`No ranking snapshot for tournament: ${String(tournamentId)}.`);
  return snapshot;
}

/** First-pass app heuristic: rating points are neither match points nor calibrated odds. */
export function projectRankedMatch(home: RankedTeam, away: RankedTeam, chosenWinner?: Winner): RankingProjection {
  for (const team of [home, away]) {
    if (!Number.isFinite(team.rating) || team.rating < 0 || !Number.isInteger(team.position) || team.position < 1) {
      throw new RangeError(`Invalid ranking input for ${team.teamId}.`);
    }
  }
  if (chosenWinner === "draw") return { homeScore: 21, awayScore: 21, winner: "draw" };
  const favoured = home.rating !== away.rating ? home.rating > away.rating
    : home.position !== away.position ? home.position < away.position : home.teamId < away.teamId;
  const winner = chosenWinner ?? (favoured ? "home" : "away");
  const margin = Math.max(1, Math.min(100, Math.round(Math.abs(home.rating - away.rating) * 2)));
  const loserScore = Math.max(3, 21 - Math.round(margin / 4));
  const winnerScore = loserScore + margin;
  return winner === "home"
    ? { homeScore: winnerScore, awayScore: loserScore, winner }
    : { homeScore: loserScore, awayScore: winnerScore, winner };
}

export function rankingProjection(
  tournament: Tournament, homeTeam: Team, awayTeam: Team, winner?: Winner,
): RankingProjection {
  const snapshot = rankingSnapshot(tournament.id);
  const tournamentRatings = ratings.get(tournament.id)!;
  const home = tournamentRatings.get(homeTeam.id);
  const away = tournamentRatings.get(awayTeam.id);
  if (!home || !away) {
    throw new RangeError(`No ranking points for ${!home ? homeTeam.id : awayTeam.id} in ${snapshot.id}.`);
  }
  return projectRankedMatch(home, away, winner);
}
