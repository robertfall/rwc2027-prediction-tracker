import type { CompletedResult, Completion, Fixture, PredictionIntent, Side, Team, Tournament, Winner } from "./types";

export const intentFields = [
  "winner", "advancing", "margin", "homeScore", "awayScore", "homeTries", "awayTries",
  "homeTryBonus", "awayTryBonus", "homeLosingBonus", "awayLosingBonus",
] as const;
export type IntentField = (typeof intentFields)[number];

export function validateIntent(value: unknown, allowClears = false): asserts value is PredictionIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RangeError("Prediction choices must be an object.");
  for (const [field, entry] of Object.entries(value)) {
    if (!(intentFields as readonly string[]).includes(field)) throw new RangeError(`Unknown prediction choice: ${field}.`);
    if (entry === undefined && allowClears) continue;
    if (field === "winner") {
      if (entry !== "home" && entry !== "away" && entry !== "draw") throw new RangeError("Choose a home win, away win, or draw.");
    } else if (field === "advancing") {
      if (entry !== "home" && entry !== "away") throw new RangeError("Choose the team advancing.");
    } else if (field.endsWith("Bonus")) {
      if (typeof entry !== "boolean") throw new RangeError("Bonus choices must be true or false.");
    } else {
      const maximum = field.endsWith("Tries") ? 15 : 255;
      if (typeof entry !== "number" || !Number.isInteger(entry) || entry < 0 || entry > maximum) {
        throw new RangeError(`${field.endsWith("Tries") ? "Tries" : "Scores and margin"} must be integers from 0 to ${maximum}.`);
      }
    }
  }
}

function winnerOf(homeScore: number, awayScore: number): Winner {
  return homeScore === awayScore ? "draw" : homeScore > awayScore ? "home" : "away";
}

function losingBonus(score: number, otherScore: number): boolean {
  return score < otherScore && otherScore - score <= 7;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/** Honest, deterministic suggestions; explicit choices remain intact when they conflict. */
export function completePrediction(
  intent: PredictionIntent,
  fixture: Fixture,
  tournament: Tournament,
  homeTeam?: Team,
  awayTeam?: Team,
): Completion {
  validateIntent(intent);
  if (Object.keys(intent).length === 0) return { issues: [] };
  if (!homeTeam || !awayTeam) return { issues: ["Choose the earlier results to resolve these teams."] };
  const knockout = fixture.stage !== "pool";
  const defaultSide: Side = (tournament.rankings[awayTeam.id] ?? Infinity) < (tournament.rankings[homeTeam.id] ?? Infinity) ? "away" : "home";
  const preferred = intent.winner ?? (intent.margin === 0 ? "draw" :
    intent.homeLosingBonus === true ? "away" : intent.awayLosingBonus === true ? "home" :
      intent.advancing ?? defaultSide);
  const desiredHome = preferred === "draw" ? 21 : preferred === "home" ? 24 : 17;
  const desiredAway = preferred === "draw" ? 21 : preferred === "away" ? 24 : 17;
  const minimumHome = Math.max(5 * (intent.homeTries ?? 0), intent.homeTryBonus === true ? 20 : 0);
  const minimumAway = Math.max(5 * (intent.awayTries ?? 0), intent.awayTryBonus === true ? 20 : 0);

  function satisfies(homeScore: number, awayScore: number): boolean {
    if (homeScore < minimumHome || awayScore < minimumAway) return false;
    const scoreWinner = winnerOf(homeScore, awayScore);
    if (intent.winner !== undefined && scoreWinner !== intent.winner) return false;
    if (knockout && intent.advancing !== undefined && scoreWinner !== "draw" && scoreWinner !== intent.advancing) return false;
    if (intent.margin !== undefined && Math.abs(homeScore - awayScore) !== intent.margin) return false;
    if (intent.homeLosingBonus !== undefined && losingBonus(homeScore, awayScore) !== intent.homeLosingBonus) return false;
    if (intent.awayLosingBonus !== undefined && losingBonus(awayScore, homeScore) !== intent.awayLosingBonus) return false;
    return true;
  }

  let best: [number, number] | undefined;
  let cost = Infinity;
  function consider(homeScore: number, awayScore: number): void {
    if (homeScore < 0 || homeScore > 255 || awayScore < 0 || awayScore > 255 || !satisfies(homeScore, awayScore)) return;
    const actualWinner = winnerOf(homeScore, awayScore);
    const candidateCost = Math.abs(homeScore - desiredHome) + Math.abs(awayScore - desiredAway) + (actualWinner === preferred ? 0 : 3);
    if (candidateCost < cost) { cost = candidateCost; best = [homeScore, awayScore]; }
  }

  if (intent.homeScore !== undefined && intent.awayScore !== undefined) {
    consider(intent.homeScore, intent.awayScore);
  } else if (intent.homeScore !== undefined || intent.awayScore !== undefined) {
    for (let score = 0; score <= 255; score++) consider(intent.homeScore ?? score, intent.awayScore ?? score);
  } else {
    // A fixed difference leaves a one-dimensional interval. Its closest endpoint/median
    // gives the same deterministic optimum without scanning 65,536 score pairs.
    for (let difference = -255; difference <= 255; difference++) {
      if (intent.margin !== undefined && Math.abs(difference) !== intent.margin) continue;
      const low = Math.max(minimumHome, minimumAway + difference);
      const high = Math.min(255, 255 + difference);
      if (low > high) continue;
      consider(clamp(desiredHome, low, high), clamp(desiredHome, low, high) - difference);
      consider(clamp(desiredAway + difference, low, high), clamp(desiredAway + difference, low, high) - difference);
    }
  }

  // Conflicting constraints keep both explicit values visible rather than silently correcting them.
  const homeScore = best?.[0] ?? intent.homeScore ?? Math.max(desiredHome, minimumHome);
  const awayScore = best?.[1] ?? intent.awayScore ?? Math.max(desiredAway, minimumAway);
  function suggestedTries(score: number, bonus?: boolean): number {
    const normal = Math.min(15, Math.floor(score / 7));
    return bonus === true ? Math.max(4, normal) : bonus === false ? Math.min(3, normal) : normal;
  }
  const homeTries = intent.homeTries ?? suggestedTries(homeScore, intent.homeTryBonus);
  const awayTries = intent.awayTries ?? suggestedTries(awayScore, intent.awayTryBonus);
  const winner = winnerOf(homeScore, awayScore);
  const advancing = knockout ? intent.advancing ?? (winner === "draw" ? undefined : winner) : undefined;
  const result: CompletedResult = { homeScore, awayScore, homeTries, awayTries, winner, ...(advancing ? { advancing } : {}) };
  return { result, issues: completionIssues(intent, fixture, result, homeTeam, awayTeam) };
}


/** Check the actual replayed values, rather than substituting today's suggestions. */
export function completionIssues(
  intent: PredictionIntent, fixture: Fixture, result: CompletedResult, homeTeam: Team, awayTeam: Team,
): string[] {
  const { homeScore, awayScore, homeTries, awayTries, winner, advancing } = result;
  const knockout = fixture.stage !== "pool";
  const issues: string[] = [];
  if (intent.winner !== undefined && intent.winner !== winner) issues.push("The chosen winner conflicts with the scores.");
  if (intent.margin !== undefined && intent.margin !== Math.abs(homeScore - awayScore)) issues.push("The chosen margin conflicts with the scores.");
  for (const side of ["home", "away"] as const) {
    const score = side === "home" ? homeScore : awayScore;
    const otherScore = side === "home" ? awayScore : homeScore;
    const tries = side === "home" ? homeTries : awayTries;
    const teamName = side === "home" ? homeTeam.name : awayTeam.name;
    if (score < tries * 5) issues.push(`${teamName}'s score cannot include ${tries} tries.`);
    const tryBonus = intent[`${side}TryBonus`];
    if (tryBonus !== undefined && tryBonus !== (tries >= 4)) issues.push(`${teamName}'s try bonus conflicts with the try count.`);
    const lossBonus = intent[`${side}LosingBonus`];
    if (lossBonus !== undefined && lossBonus !== losingBonus(score, otherScore)) issues.push(`${teamName}'s losing bonus conflicts with the score margin.`);
  }
  if (!knockout && intent.advancing !== undefined) issues.push("Advancement applies only to knockout matches.");
  if (knockout && advancing === undefined) issues.push("Choose which team advances after the drawn score.");
  if (knockout && winner !== "draw" && advancing !== winner) issues.push("The advancing team conflicts with the final scores.");
  return issues;
}
