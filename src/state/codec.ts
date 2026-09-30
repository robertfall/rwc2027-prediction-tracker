import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import type { CompletedResult, Prediction, Scenario, Tournament, Winner } from "../domain/types";
import { intentFields, validateIntent, type IntentField } from "../domain/completion";
import { getTournament } from "../domain/tournaments";
import { deriveScenario } from "../domain/derive";
import { decode as decodeLegacy, PredictionLinkError } from "../services/results/compression";

export { PredictionLinkError };
const MAX_RAW_BYTES = 16384;
const MAX_FRAME_BYTES = 8192;
const scenarioKeys = ["schemaVersion", "tournamentId", "datasetVersion", "rulesVersion", "completionVersion", "predictions", "resolved"];
const resultKeys = ["homeScore", "awayScore", "homeTries", "awayTries", "winner", "advancing"];

function invalid(message = "The prediction link is malformed."): never { throw new PredictionLinkError(message); }
function object(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function unknownKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean { return Object.keys(value).some((key) => !allowed.includes(key)); }
function winnerFromScores(homeScore: number, awayScore: number): Winner { return homeScore === awayScore ? "draw" : homeScore > awayScore ? "home" : "away"; }

function validateResult(value: unknown, prediction: Prediction, isPool: boolean): asserts value is CompletedResult {
  if (!object(value) || unknownKeys(value, resultKeys)) invalid("The link contains an invalid completed result.");
  for (const field of ["homeScore", "awayScore", "homeTries", "awayTries"] as const) {
    const entry = value[field];
    if (typeof entry !== "number" || !Number.isInteger(entry) || entry < 0 || entry > (field.endsWith("Tries") ? 15 : 255)) invalid("The link contains invalid scoring values.");
    if (prediction.intent[field] !== undefined && prediction.intent[field] !== entry) invalid("Saved outcomes disagree with an explicit scoring choice.");
  }
  if (value.winner !== winnerFromScores(value.homeScore as number, value.awayScore as number)) invalid("Saved winner disagrees with the scores.");
  if (value.advancing !== undefined && (isPool || (value.advancing !== "home" && value.advancing !== "away"))) invalid("The link contains invalid advancement.");
  if (!isPool && prediction.intent.advancing !== undefined && value.advancing !== prediction.intent.advancing) invalid("Saved advancement disagrees with the explicit choice.");
  if (value.advancing !== undefined && value.winner !== "draw" && value.advancing !== value.winner) invalid("Saved advancement disagrees with the scores.");
  const homeScore = value.homeScore as number;
  const awayScore = value.awayScore as number;
  if (prediction.intent.winner !== undefined && prediction.intent.winner !== value.winner) invalid("Saved winner disagrees with the explicit choice.");
  if (prediction.intent.margin !== undefined && prediction.intent.margin !== Math.abs(homeScore - awayScore)) invalid("Saved margin disagrees with the explicit choice.");
  for (const side of ["home", "away"] as const) {
    const tries = value[`${side}Tries`] as number;
    const score = side === "home" ? homeScore : awayScore;
    const otherScore = side === "home" ? awayScore : homeScore;
    const tryBonus = prediction.intent[`${side}TryBonus`];
    const losingBonus = prediction.intent[`${side}LosingBonus`];
    if (tryBonus !== undefined && tryBonus !== (tries >= 4)) invalid("Saved try bonus disagrees with the explicit choice.");
    if (losingBonus !== undefined && losingBonus !== (score < otherScore && otherScore - score <= 7)) invalid("Saved losing bonus disagrees with the explicit choice.");
  }
}

export function validateScenario(value: unknown): asserts value is Scenario {
  if (!object(value) || unknownKeys(value, scenarioKeys) || value.schemaVersion !== 2) invalid("This prediction link uses an unsupported version.");
  if (value.tournamentId !== "rwc2023" && value.tournamentId !== "rwc2027") invalid("This prediction link belongs to an unsupported tournament.");
  const tournament = getTournament(value.tournamentId);
  if (value.datasetVersion !== tournament.datasetVersion || value.rulesVersion !== tournament.rulesVersion) invalid("This prediction link belongs to a different fixture dataset or rules version.");
  if (value.completionVersion !== "defaults-v1") invalid("This prediction link uses an unsupported completion version.");
  if (!object(value.predictions) || (value.resolved !== undefined && !object(value.resolved))) invalid();
  const fixtures = new Map(tournament.fixtures.map((fixture) => [fixture.id, fixture]));
  const teams = new Set(tournament.teams.map((team) => team.id));
  if (Object.keys(value.predictions).length > fixtures.size) invalid();
  for (const [id, prediction] of Object.entries(value.predictions)) {
    if (!/^[1-9]\d*$/.test(id) || !fixtures.has(Number(id)) || !object(prediction) || unknownKeys(prediction, ["intent", "participants"])) invalid("The prediction link contains an invalid match.");
    try { validateIntent(prediction.intent); } catch { invalid("The prediction link contains invalid choices."); }
    if (!Object.keys(prediction.intent as Record<string, unknown>).length) invalid("The prediction link contains an empty choice.");
    if (prediction.participants !== undefined && (!Array.isArray(prediction.participants) || prediction.participants.length !== 2 ||
      prediction.participants.some((team) => typeof team !== "string" || !teams.has(team)) || prediction.participants[0] === prediction.participants[1])) invalid("The prediction link contains invalid participants.");
    const result = value.resolved?.[id];
    if (result !== undefined) validateResult(result, prediction as unknown as Prediction, fixtures.get(Number(id))!.stage === "pool");
  }
  const predictions = value.predictions;
  if (value.resolved && Object.keys(value.resolved).some((id) => !Object.hasOwn(predictions, id))) invalid("The prediction link has an outcome without a choice.");
  if (Object.values(predictions).some((prediction) => object(prediction) && prediction.participants !== undefined)) {
    // A pending matchup can keep a dormant bound pick. A known different matchup
    // is a malformed import, not an action whose consequences may silently clear intent.
    const derived = deriveScenario(value as unknown as Scenario);
    for (const fixture of derived.fixtures) {
      const participants = fixture.prediction?.participants;
      if (participants && fixture.homeTeam && fixture.awayTeam &&
        (participants[0] !== fixture.homeTeam.id || participants[1] !== fixture.awayTeam.id)) {
        invalid("Saved participants disagree with the resolved matchup.");
      }
    }
  }
}

function toBase64url(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64url(value: string): Uint8Array {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > Math.ceil(MAX_FRAME_BYTES * 4 / 3) || value.length % 4 === 1) invalid();
  try {
    const bytes = Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (character) => character.charCodeAt(0));
    if (toBase64url(bytes) !== value) invalid();
    return bytes;
  } catch { return invalid(); }
}

function pack(scenario: Scenario): unknown[] {
  const rows = Object.entries(scenario.predictions).sort(([a], [b]) => Number(a) - Number(b)).map(([id, prediction]) => {
    let mask = 0;
    const values: unknown[] = [];
    intentFields.forEach((field, index) => {
      if (prediction.intent[field] !== undefined) { mask |= 1 << index; values.push(prediction.intent[field]); }
    });
    const result = scenario.resolved?.[Number(id)];
    return [Number(id), mask, values, prediction.participants ?? null, result ?
      [result.homeScore, result.awayScore, result.homeTries, result.awayTries, result.winner, result.advancing ?? null] : null];
  });
  return [scenario.rulesVersion, scenario.completionVersion, rows];
}

export function encodeScenario(scenario: Scenario): string {
  validateScenario(scenario);
  const raw = strToU8(JSON.stringify(pack(scenario)));
  if (raw.length > MAX_RAW_BYTES) invalid("This prediction set is too large to share.");
  const compressed = deflateSync(raw, { level: 6 });
  const frame = new Uint8Array(compressed.length + 4);
  frame[0] = raw.length >> 8;
  frame[1] = raw.length & 255;
  frame[2] = compressed.length >> 8;
  frame[3] = compressed.length & 255;
  frame.set(compressed, 4);
  if (frame.length > MAX_FRAME_BYTES) invalid("This prediction set is too large to share.");
  return `v2.${scenario.tournamentId}.${scenario.datasetVersion}.${toBase64url(frame)}`;
}

function unpack(value: unknown, tournament: Tournament): Scenario {
  if (!Array.isArray(value) || value.length !== 3 || typeof value[0] !== "string" || typeof value[1] !== "string" || !Array.isArray(value[2]) || value[2].length > tournament.fixtures.length) invalid();
  const scenario: Scenario = {
    schemaVersion: 2, tournamentId: tournament.id, datasetVersion: tournament.datasetVersion,
    rulesVersion: value[0], completionVersion: value[1] as Scenario["completionVersion"], predictions: {}, resolved: {},
  };
  for (const row of value[2]) {
    if (!Array.isArray(row) || row.length !== 5 || !Number.isInteger(row[0]) || !Number.isInteger(row[1]) ||
      row[1] <= 0 || row[1] >= 1 << intentFields.length || !Array.isArray(row[2])) invalid();
    const id = row[0] as number;
    if (Object.hasOwn(scenario.predictions, id)) invalid("The prediction link repeats a match.");
    const intent: Prediction["intent"] = {};
    let cursor = 0;
    intentFields.forEach((field, index) => {
      if (row[1] & (1 << index)) Object.assign(intent, { [field]: row[2][cursor++] });
    });
    if (cursor !== row[2].length) invalid();
    scenario.predictions[id] = { intent, ...(row[3] !== null ? { participants: row[3] } : {}) };
    if (row[4] !== null) {
      const result = row[4];
      if (!Array.isArray(result) || result.length !== 6) invalid();
      scenario.resolved![id] = {
        homeScore: result[0], awayScore: result[1], homeTries: result[2], awayTries: result[3], winner: result[4],
        ...(result[5] !== null ? { advancing: result[5] } : {}),
      };
    }
  }
  validateScenario(scenario);
  return scenario;
}

function importLegacy(encoded: string): Scenario {
  const tournament = getTournament("rwc2023");
  const scenario: Scenario = {
    schemaVersion: 2, tournamentId: tournament.id, datasetVersion: tournament.datasetVersion,
    rulesVersion: tournament.rulesVersion, completionVersion: "defaults-v1", predictions: {}, resolved: {},
  };
  for (const result of decodeLegacy(encoded)) {
    if (!result.touched) continue;
    const intent: Prediction["intent"] = {};
    for (const field of ["homeScore", "awayScore", "homeTries", "awayTries"] as const) {
      if (result[field] !== undefined) intent[field] = result[field];
    }
    if (!Object.keys(intent).length) continue;
    scenario.predictions[result.matchNumber] = { intent };
    if (intent.homeScore !== undefined && intent.awayScore !== undefined && intent.homeTries !== undefined && intent.awayTries !== undefined) {
      const winner = winnerFromScores(intent.homeScore, intent.awayScore);
      const knockout = tournament.fixtures.find((fixture) => fixture.id === result.matchNumber)?.stage !== "pool";
      scenario.resolved![result.matchNumber] = {
        homeScore: intent.homeScore, awayScore: intent.awayScore, homeTries: intent.homeTries, awayTries: intent.awayTries, winner,
        ...(knockout && winner !== "draw" ? { advancing: winner } : {}),
      };
    }
  }
  validateScenario(scenario);
  return scenario;
}

export function decodeScenario(encoded: string): Scenario {
  if (!encoded.startsWith("v2.")) {
    if (/^v\d+\./.test(encoded) && !encoded.startsWith("v1.")) invalid("This prediction link uses an unsupported version.");
    return importLegacy(encoded);
  }
  const parts = encoded.split(".");
  if (parts.length !== 4 || (parts[1] !== "rwc2023" && parts[1] !== "rwc2027")) invalid("This prediction link belongs to an unsupported tournament.");
  const tournament = getTournament(parts[1]);
  if (parts[2] !== tournament.datasetVersion) invalid("This prediction link belongs to a different fixture dataset.");
  const frame = fromBase64url(parts[3]);
  const rawLength = (frame[0] << 8) | frame[1];
  const compressedLength = (frame[2] << 8) | frame[3];
  if (frame.length < 5 || !rawLength || rawLength > MAX_RAW_BYTES || compressedLength !== frame.length - 4) invalid();
  try {
    // The declared length is capped before decompression; one extra byte detects oversized output.
    const raw = inflateSync(frame.subarray(4), { out: new Uint8Array(rawLength + 1) });
    if (raw.length !== rawLength) invalid();
    return unpack(JSON.parse(strFromU8(raw)), tournament);
  } catch (error) {
    if (error instanceof PredictionLinkError) throw error;
    return invalid();
  }
}

export type { IntentField };
