import { fixtures as legacyFixtures } from "../data/fixtures";
import type { FixtureTeam } from "../data/fixtures";
import { teamCatalog, tournament2027 } from "./data-2027";
import type { Fixture, TeamSource, Tournament } from "./types";

const legacyPools = {
  A: ["nz", "fr", "it", "uy", "na"],
  B: ["za", "ie", "gb-sct", "to", "ro"],
  C: ["gb-wls", "au", "fj", "ge", "pt"],
  D: ["gb-eng", "jp", "ar", "ws", "cl"],
};

function legacySource(source: FixtureTeam): TeamSource {
  if (typeof source === "string") {
    const team = teamCatalog.find((team) => team.name === source);
    if (!team) throw new Error(`Unknown legacy team: ${source}`);
    return { kind: "team", teamId: team.id };
  }
  if ("pool" in source) {
    return { kind: "pool", pool: source.pool, position: source.position as 1 | 2 };
  }
  return { kind: source.team, fixtureId: source.matchNumber };
}

const fixtures2023: Fixture[] = legacyFixtures.map((fixture) => ({
  id: fixture.matchNumber,
  stage: "group" in fixture ? "pool"
    : fixture.matchNumber <= 44 ? "quarter"
    : fixture.matchNumber <= 46 ? "semi"
    : fixture.matchNumber === 47 ? "bronze" : "final",
  ...("group" in fixture ? { pool: fixture.group } : {}),
  home: legacySource(fixture.homeTeam),
  away: legacySource(fixture.awayTeam),
  kickoff: fixture.dateUtc.replace(" ", "T"),
  venue: fixture.location,
}));

export const tournament2023: Tournament = {
  id: "rwc2023",
  datasetVersion: "fixtures-v1",
  rulesVersion: "2023-v1",
  name: "Rugby World Cup 2023",
  teams: teamCatalog.filter((team) => Object.values(legacyPools).flat().includes(team.id)),
  pools: Object.entries(legacyPools).map(([id, teamIds]) => ({ id, teamIds })),
  fixtures: fixtures2023,
  rankings: {
    ie: 1, fr: 2, za: 3, nz: 4, "gb-sct": 5, "gb-eng": 6,
    "gb-wls": 7, fj: 8, ar: 9, au: 10, it: 11, jp: 12,
    ge: 13, ws: 14, to: 15, pt: 16, uy: 17, ro: 19, na: 21, cl: 22,
  },
  rankingsLabel: "World Rugby rankings, 2 October 2023",
  rulesStatus: "confirmed",
  sources: [
    { label: "Official 2023 tournament rules", url: "https://resources.world.rugby/worldrugby/document/2023/05/03/fb8ea1ec-b3d9-46c6-933e-bdd1105e3bed/RWC-2023-Tournament-Rules.pdf" },
    { label: "Official tie-break rankings snapshot", url: "https://api.wr-rims-prod.pulselive.com/rugby/v3/rankings/mru?date=2023-10-02" },
  ],
};

export const defaultTournament = tournament2027;

export function getTournament(id: Tournament["id"]): Tournament {
  if (id === "rwc2027") return tournament2027;
  if (id === "rwc2023") return tournament2023;
  throw new Error(`Unsupported tournament: ${String(id)}`);
}
