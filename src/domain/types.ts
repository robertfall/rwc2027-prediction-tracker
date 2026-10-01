export type Side = "home" | "away";
export type Winner = Side | "draw";
export type Stage = "pool" | "round16" | "quarter" | "semi" | "bronze" | "final";

export interface Team {
  id: string;
  name: string;
  shortName: string;
  flag: string;
}

export type TeamSource =
  | { kind: "team"; teamId: string }
  | { kind: "pool"; pool: string; position: 1 | 2 }
  | { kind: "third"; againstPool: string }
  | { kind: "winner" | "loser"; fixtureId: number };

export interface Fixture {
  id: number;
  stage: Stage;
  pool?: string;
  home: TeamSource;
  away: TeamSource;
  kickoff: string;
  venue: string;
}

export interface Pool {
  id: string;
  teamIds: string[];
}

export interface Tournament {
  id: "rwc2027" | "rwc2023";
  datasetVersion: string;
  rulesVersion: string;
  name: string;
  teams: Team[];
  pools: Pool[];
  fixtures: Fixture[];
  rankings: Record<string, number>;
  rankingsLabel: string;
  rulesStatus: "provisional" | "confirmed";
  rulesNote?: string;
  sources: { label: string; url: string }[];
}

export interface PredictionIntent {
  winner?: Winner;
  advancing?: Side;
  margin?: number;
  homeScore?: number;
  awayScore?: number;
  homeTries?: number;
  awayTries?: number;
  homeTryBonus?: boolean;
  awayTryBonus?: boolean;
  homeLosingBonus?: boolean;
  awayLosingBonus?: boolean;
}

export interface Prediction {
  intent: PredictionIntent;
  participants?: [string, string];
}

export interface CompletedResult {
  homeScore: number;
  awayScore: number;
  homeTries: number;
  awayTries: number;
  winner: Winner;
  advancing?: Side;
}

/** A fully planned edit, independent of history and prediction-link encoding. */
export interface PredictionUpdate {
  fixtureId: number;
  intent: PredictionIntent;
  participants?: [string, string];
  result: CompletedResult;
}

export interface Scenario {
  schemaVersion: 2;
  tournamentId: Tournament["id"];
  datasetVersion: string;
  rulesVersion: string;
  completionVersion: "defaults-v1";
  predictions: Record<number, Prediction>;
  resolved?: Record<number, CompletedResult>;
}

export interface Standing {
  teamId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  pointsFor: number;
  pointsAgainst: number;
  triesFor: number;
  triesAgainst: number;
  tryBonuses: number;
  losingBonuses: number;
}

export interface ResolvedFixture extends Fixture {
  homeTeam?: Team;
  awayTeam?: Team;
  prediction?: Prediction;
  result?: CompletedResult;
  issues: string[];
}

export interface DerivedScenario {
  tournament: Tournament;
  fixtures: ResolvedFixture[];
  standings: Record<string, Standing[]>;
  qualifiedThirdPools: string[];
  poolsComplete: boolean;
}

export interface Completion {
  result?: CompletedResult;
  issues: string[];
}
