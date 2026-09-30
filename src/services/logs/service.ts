import { MatchNumber } from "../../data/fixtures";
import { TeamName } from "../../data/teams";

export type LogsStore = {
  logs: Partial<Record<MatchNumber, Log>>;
};

export type Log = LogEntry[];
export type LogEntry = {
  team: TeamName;
  points: number;
  tries: number;
  pointsDifference: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  matchesDrawn: number;
};
