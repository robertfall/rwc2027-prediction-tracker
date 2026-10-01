import { completePrediction, intentFields } from "../domain/completion";
import { getTournament } from "../domain/tournaments";
import type { CompletedResult, Fixture, Prediction, PredictionIntent, Scenario, Tournament } from "../domain/types";
import { PredictionLinkError } from "../services/results/compression";

// Wire identities and team-index order are permanent. Add a new profile when any
// dataset, rules, rankings or completion algorithm changes; retain old readers.
const profiles = [
  {
    id: 1, tournamentId: "rwc2027", datasetVersion: "fixtures-2026-02",
    rulesVersion: "provisional-v1", completionVersion: "defaults-v1",
    teams: ["nz", "au", "cl", "hk", "za", "it", "ge", "ro", "ar", "fj", "es", "ca", "ie", "gb-sct", "uy", "pt", "fr", "jp", "us", "ws", "gb-eng", "gb-wls", "to", "zw"],
  },
  {
    id: 2, tournamentId: "rwc2023", datasetVersion: "fixtures-v1",
    rulesVersion: "2023-v1", completionVersion: "defaults-v1",
    teams: ["nz", "au", "cl", "za", "it", "ge", "ro", "ar", "fj", "ie", "gb-sct", "uy", "pt", "fr", "jp", "ws", "gb-eng", "gb-wls", "to", "na"],
  },
] as const;
type Profile = (typeof profiles)[number];
export const MAX_COMPACT_BYTES = 1024;

function invalid(message = "The prediction link is malformed."): never { throw new PredictionLinkError(message); }

class BitWriter {
  private bytes: number[] = [];
  private position = 0;
  write(value: number, width: number): void {
    for (let bit = width - 1; bit >= 0; bit--) {
      const offset = this.position % 8;
      if (offset === 0) this.bytes.push(0);
      this.bytes[this.bytes.length - 1] |= ((value >> bit) & 1) << (7 - offset);
      this.position++;
    }
  }
  finish(): Uint8Array { return Uint8Array.from(this.bytes); }
}

class BitReader {
  private position = 0;
  constructor(private bytes: Uint8Array) {}
  read(width: number): number {
    if (this.position + width > this.bytes.length * 8) invalid();
    let value = 0;
    for (let bit = 0; bit < width; bit++) {
      value = value * 2 + ((this.bytes[this.position >> 3] >> (7 - this.position % 8)) & 1);
      this.position++;
    }
    return value;
  }
  finish(): void {
    if (Math.ceil(this.position / 8) !== this.bytes.length) invalid();
    const padding = (8 - this.position % 8) % 8;
    if (padding && (this.bytes[this.bytes.length - 1] & ((1 << padding) - 1))) invalid();
  }
}

function profileFor(scenario: Scenario): Profile {
  const profile = profiles.find((entry) => entry.tournamentId === scenario.tournamentId &&
    entry.datasetVersion === scenario.datasetVersion && entry.rulesVersion === scenario.rulesVersion &&
    entry.completionVersion === scenario.completionVersion);
  if (!profile) invalid("This prediction link uses an unsupported version.");
  return profile;
}

// One last completion per fixed profile/fixture keeps serialization from solving
// unchanged matches again on every keystroke. Returned values are independent.
const defaultResults = new Map<string, { key: string; result?: CompletedResult }>();
function defaultResult(prediction: Prediction, fixture: Fixture, tournament: Tournament, profile: Profile): CompletedResult | undefined {
  const homeId = prediction.participants?.[0] ?? (fixture.home.kind === "team" ? fixture.home.teamId : undefined);
  const awayId = prediction.participants?.[1] ?? (fixture.away.kind === "team" ? fixture.away.teamId : undefined);
  const slot = `${profile.id}:${fixture.id}`;
  const key = JSON.stringify([homeId, awayId, intentFields.map((field) => prediction.intent[field])]);
  const previous = defaultResults.get(slot);
  if (previous?.key === key) return previous.result ? { ...previous.result } : undefined;
  // Saved bindings also recover dormant knockout defaults while earlier matches
  // are unresolved. Unbound knockouts keep their completed values explicitly.
  const result = completePrediction(prediction.intent, fixture, tournament,
    tournament.teams.find((team) => team.id === homeId),
    tournament.teams.find((team) => team.id === awayId)).result;
  defaultResults.set(slot, { key, result });
  return result ? { ...result } : undefined;
}

function sameResult(a: CompletedResult | undefined, b: CompletedResult): boolean {
  return Boolean(a && a.homeScore === b.homeScore && a.awayScore === b.awayScore &&
    a.homeTries === b.homeTries && a.awayTries === b.awayTries && a.winner === b.winner && a.advancing === b.advancing);
}

function writeIntent(writer: BitWriter, intent: PredictionIntent, fixture: Fixture): void {
  const fields = Object.keys(intent);
  const choice = fields.length === 1
    ? fixture.stage === "pool" && intent.winner ? ["", "home", "away", "draw"].indexOf(intent.winner)
      : fixture.stage !== "pool" && intent.advancing ? ["", "home", "away"].indexOf(intent.advancing) : 0
    : 0;
  // The common winner/advancement-only edit fits in two bits, without a mask.
  writer.write(choice, 2);
  if (choice) return;
  let mask = 0;
  intentFields.forEach((field, index) => { if (intent[field] !== undefined) mask |= 1 << index; });
  writer.write(mask, 11);
  for (const field of intentFields) {
    const value = intent[field];
    if (value === undefined) continue;
    if (field === "winner") writer.write(["home", "away", "draw"].indexOf(value as string), 2);
    else if (field === "advancing") writer.write(value === "away" ? 1 : 0, 1);
    else if (field.endsWith("Bonus")) writer.write(value ? 1 : 0, 1);
    else writer.write(value as number, field.endsWith("Tries") ? 4 : 8);
  }
}

function readIntent(reader: BitReader, fixture: Fixture): PredictionIntent {
  const choice = reader.read(2);
  if (choice) {
    if (fixture.stage === "pool") return { winner: (["home", "away", "draw"] as const)[choice - 1] };
    if (choice === 3) invalid();
    return { advancing: choice === 1 ? "home" : "away" };
  }
  const mask = reader.read(11);
  if (!mask) invalid("The prediction link contains an empty choice.");
  const intent: PredictionIntent = {};
  intentFields.forEach((field, index) => {
    if (!(mask & (1 << index))) return;
    let value: PredictionIntent[typeof field];
    if (field === "winner") {
      const winner = reader.read(2);
      if (winner === 3) invalid();
      value = (["home", "away", "draw"] as const)[winner];
    } else if (field === "advancing") value = reader.read(1) ? "away" : "home";
    else if (field.endsWith("Bonus")) value = Boolean(reader.read(1));
    else value = reader.read(field.endsWith("Tries") ? 4 : 8);
    Object.assign(intent, { [field]: value });
  });
  return intent;
}

export function packCompact(scenario: Scenario): Uint8Array {
  const profile = profileFor(scenario);
  const tournament = getTournament(scenario.tournamentId);
  const fixtures = new Map(tournament.fixtures.map((fixture) => [fixture.id, fixture]));
  const rows = Object.entries(scenario.predictions).sort(([a], [b]) => Number(a) - Number(b));
  const writer = new BitWriter();
  writer.write(profile.id, 8);
  writer.write(scenario.resolved === undefined ? 0 : 1, 1);
  writer.write(rows.length, 6);
  for (const [id, prediction] of rows) {
    const fixture = fixtures.get(Number(id))!;
    writer.write(Number(id), 6);
    writeIntent(writer, prediction.intent, fixture);
    writer.write(prediction.participants ? 1 : 0, 1);
    if (prediction.participants) for (const team of prediction.participants) {
      const index = (profile.teams as readonly string[]).indexOf(team);
      if (index < 0) invalid("The prediction link contains invalid participants.");
      writer.write(index, 5);
    }
    const result = scenario.resolved?.[Number(id)];
    const resultMode = result === undefined ? 0 : sameResult(defaultResult(prediction, fixture, tournament, profile), result) ? 1 : 2;
    writer.write(resultMode, 2);
    if (resultMode === 2) {
      writer.write(result!.homeScore, 8);
      writer.write(result!.awayScore, 8);
      writer.write(result!.homeTries, 4);
      writer.write(result!.awayTries, 4);
      writer.write(result!.advancing === undefined ? 0 : result!.advancing === "home" ? 1 : 2, 2);
    }
  }
  const bytes = writer.finish();
  if (bytes.length > MAX_COMPACT_BYTES) invalid("This prediction set is too large to share.");
  return bytes;
}

export function unpackCompact(bytes: Uint8Array): Scenario {
  if (!bytes.length || bytes.length > MAX_COMPACT_BYTES) invalid();
  const reader = new BitReader(bytes);
  const profileId = reader.read(8);
  const profile = profiles.find((entry) => entry.id === profileId);
  if (!profile) invalid("This prediction link uses an unsupported tournament or prediction version.");
  const tournament = getTournament(profile.tournamentId);
  const scenario: Scenario = {
    schemaVersion: 2, tournamentId: profile.tournamentId, datasetVersion: profile.datasetVersion,
    rulesVersion: profile.rulesVersion, completionVersion: profile.completionVersion, predictions: {},
    ...(reader.read(1) ? { resolved: {} } : {}),
  };
  const count = reader.read(6);
  if (count > tournament.fixtures.length) invalid();
  const fixtures = new Map(tournament.fixtures.map((fixture) => [fixture.id, fixture]));
  let previousId = 0;
  for (let row = 0; row < count; row++) {
    const id = reader.read(6);
    const fixture = fixtures.get(id);
    if (!fixture || id <= previousId) invalid("The prediction link contains an invalid or repeated match.");
    previousId = id;
    const prediction: Prediction = { intent: readIntent(reader, fixture) };
    if (reader.read(1)) {
      const home = profile.teams[reader.read(5)];
      const away = profile.teams[reader.read(5)];
      if (!home || !away || home === away) invalid("The prediction link contains invalid participants.");
      prediction.participants = [home, away];
    }
    scenario.predictions[id] = prediction;
    const resultMode = reader.read(2);
    if (resultMode === 3 || (resultMode && !scenario.resolved)) invalid();
    if (resultMode === 1) {
      const result = defaultResult(prediction, fixture, tournament, profile);
      if (!result) invalid("Saved outcomes require resolved participants.");
      scenario.resolved![id] = result;
    } else if (resultMode === 2) {
      const homeScore = reader.read(8);
      const awayScore = reader.read(8);
      const homeTries = reader.read(4);
      const awayTries = reader.read(4);
      const advancing = reader.read(2);
      if (advancing === 3) invalid();
      scenario.resolved![id] = {
        homeScore, awayScore, homeTries, awayTries,
        winner: homeScore === awayScore ? "draw" : homeScore > awayScore ? "home" : "away",
        ...(advancing ? { advancing: advancing === 1 ? "home" : "away" } : {}),
      };
    }
  }
  reader.finish();
  return scenario;
}
