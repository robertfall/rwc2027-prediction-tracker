import { For, Show } from "solid-js";
import type { Standing, Team } from "../domain/types";
import { TeamLabel } from "./TeamLabel";

export function StandingsTable(props: { pool: string; standings: Standing[]; teams: Team[]; complete: boolean; thirdQualified: boolean }) {
  const team = (id: string) => props.teams.find((candidate) => candidate.id === id);
  return <div class="standings-wrap">
    <table class="standings" aria-label={`Pool ${props.pool} standings`}><thead><tr>
      <th scope="col"><span class="sr-only">Position</span></th><th scope="col">Team</th><th scope="col"><abbr title="Played">P</abbr></th><th scope="col">Pts</th><th scope="col"><abbr title="Points difference">+/−</abbr></th>
    </tr></thead><tbody><For each={props.standings}>{(standing, index) => <tr classList={{ "qualifying-row": props.complete && (index() < 2 || (index() === 2 && props.thirdQualified)) }}>
      <td>{index() + 1}</td><th scope="row"><TeamLabel team={team(standing.teamId)} short /><Show when={props.complete && (index() < 2 || (index() === 2 && props.thirdQualified))}><span class="qualified-badge" aria-hidden="true">Q</span><span class="sr-only">, qualified</span></Show></th><td>{standing.played}</td><td class="standing-points">{standing.points}</td><td>{standing.pointsFor - standing.pointsAgainst}</td>
    </tr>}</For></tbody></table>
    <details class="statistics"><summary>Full statistics</summary><div class="table-scroll" tabindex="0" role="region" aria-label={`Pool ${props.pool} statistics, scroll for more columns`}><table class="full-statistics" aria-label={`Pool ${props.pool} detailed statistics`}><thead><tr>
      <th scope="col">Team</th><th scope="col">W</th><th scope="col">D</th><th scope="col">L</th><th scope="col">For</th><th scope="col">Against</th><th scope="col">Tries for</th><th scope="col">Tries against</th><th scope="col">TB</th><th scope="col">LB</th>
    </tr></thead><tbody><For each={props.standings}>{(standing) => <tr><th scope="row">{team(standing.teamId)?.shortName}</th><td>{standing.wins}</td><td>{standing.draws}</td><td>{standing.losses}</td><td>{standing.pointsFor}</td><td>{standing.pointsAgainst}</td><td>{standing.triesFor}</td><td>{standing.triesAgainst}</td><td>{standing.tryBonuses}</td><td>{standing.losingBonuses}</td></tr>}</For></tbody></table></div><p>W/D/L: wins, draws, losses. TB/LB: try and losing bonus points.</p></details>
  </div>;
}
