import { MatchTeams, TeamName } from "../../data/teams";
import { isCompleteResult, Result } from "../results/model";
import { getPoints } from "./points";
import { LogEntry } from "./service";

export function defaultLogEntry(team: TeamName): LogEntry {
  return {
    team,
    points: 0,
    tries: 0,
    pointsDifference: 0,
    matchesPlayed: 0,
    matchesWon: 0,
    matchesLost: 0,
    matchesDrawn: 0,
  };
}
export type MatchResult = Result & MatchTeams;
export function createLogEntries(
  results: readonly MatchResult[],
  teams: readonly TeamName[] = [],
): LogEntry[] {
  const logEntries = new Map<TeamName, LogEntry>(teams.map((team) => [team, defaultLogEntry(team)]));
  for (const result of results) {
    if (!isCompleteResult(result)) continue;

    const { homePoints, awayPoints } = getPoints(result);
    const { homeTeam, awayTeam, homeScore, awayScore, homeTries, awayTries } =
      result;

    let homeLogEntry = logEntries.get(homeTeam);
    if (!homeLogEntry) {
      homeLogEntry = defaultLogEntry(homeTeam);
      logEntries.set(homeTeam, homeLogEntry);
    }
    homeLogEntry.points += homePoints;
    homeLogEntry.tries += homeTries;
    homeLogEntry.pointsDifference += homeScore - awayScore;
    homeLogEntry.matchesPlayed += 1;

    let awayLogEntry = logEntries.get(awayTeam);
    if (!awayLogEntry) {
      awayLogEntry = defaultLogEntry(awayTeam);
      logEntries.set(awayTeam, awayLogEntry);
    }
    awayLogEntry.points += awayPoints;
    awayLogEntry.tries += awayTries;
    awayLogEntry.pointsDifference += awayScore - homeScore;
    awayLogEntry.matchesPlayed += 1;

    if (homeScore > awayScore) {
      homeLogEntry.matchesWon += 1;
      awayLogEntry.matchesLost += 1;
    } else if (homeScore < awayScore) {
      awayLogEntry.matchesWon += 1;
      homeLogEntry.matchesLost += 1;
    } else {
      homeLogEntry.matchesDrawn += 1;
      awayLogEntry.matchesDrawn += 1;
    }
  }

  return [...logEntries.values()].sort((a, b) => b.points - a.points);
}
