import { fixtures, MatchNumber } from "../../data/fixtures";

export const resultFields = [
  "homeScore",
  "awayScore",
  "homeTries",
  "awayTries",
] as const;
export type ResultField = (typeof resultFields)[number];
export type ResultValues = Record<ResultField, number>;
export type PristineResultData = { touched: false };
export type TouchedResultData = { touched: true } & Partial<ResultValues>;
export type ResultData = PristineResultData | TouchedResultData;
export type PristineResult = { matchNumber: MatchNumber } & PristineResultData;
export type TouchedResult = { matchNumber: MatchNumber } & TouchedResultData;
export type CompleteResult = { matchNumber: MatchNumber; touched: true } & ResultValues;
export type Result = PristineResult | TouchedResult;
export type ResultUpdate = { matchNumber: MatchNumber } & Partial<ResultValues>;

const matchNumbers = new Set<number>(fixtures.map((fixture) => fixture.matchNumber));

export function isValidMatchNumber(value: unknown): value is MatchNumber {
  return typeof value === "number" && matchNumbers.has(value);
}

export function isValidResultFieldValue(
  field: ResultField,
  value: unknown,
): value is number {
  const maximum = field.endsWith("Score") ? 255 : 15;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= maximum;
}

export function isValidResult(value: unknown): value is Result {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Record<string, unknown>;
  if (!isValidMatchNumber(result.matchNumber) || typeof result.touched !== "boolean") return false;
  return resultFields.every((field) => result[field] === undefined ||
    (result.touched && isValidResultFieldValue(field, result[field])));
}

export function isCompleteResult(value: unknown): value is CompleteResult {
  if (!isValidResult(value) || !value.touched) return false;
  return resultFields.every((field) => isValidResultFieldValue(field, value[field]));
}
