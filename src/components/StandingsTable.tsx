import { For, Show, createMemo } from "solid-js";
import type { Standing, Team } from "../domain/types";
import { Icon } from "./Icon";

export interface StandingsTableProps {
  pool: string;
  standings: Standing[];
  teams: Team[];
  complete: boolean;
  thirdQualified: boolean;
  compact?: boolean;
}

export function StandingsTable(props: StandingsTableProps) {
  const teams = createMemo(() => new Map(props.teams.map((team) => [team.id, team])));
  const qualified = (index: number) => props.complete && (index < 2 || (index === 2 && props.thirdQualified));
  const qualificationLabel = (index: number) => index === 2 ? "Qualified as a best third-place team" : "Qualified";
  const difference = (row: Standing) => {
    const value = row.pointsFor - row.pointsAgainst;
    return value > 0 ? `+${value}` : String(value);
  };
  return <div classList={{ "standings-wrap": true, "standings-wrap--compact": Boolean(props.compact) }}>
    <Show when={props.compact}><div class="compact-table-heading"><h3>Pool {props.pool}</h3><span>Pts</span></div></Show>
    <table classList={{ standings: true, "standings--compact": Boolean(props.compact) }} aria-label={`Pool ${props.pool} standings`}>
      <thead classList={{ "sr-only": Boolean(props.compact) }}><tr>
        <th scope="col"><span class="sr-only">Position</span></th><th scope="col">Team</th>
        <Show when={!props.compact}>
          <th scope="col"><abbr title="Played">P</abbr></th>
          <th class="standing-wdl" scope="col"><abbr title="Wins">W</abbr></th>
          <th class="standing-wdl" scope="col"><abbr title="Draws">D</abbr></th>
          <th class="standing-wdl" scope="col"><abbr title="Losses">L</abbr></th>
          <th scope="col"><abbr title="Points difference">+/−</abbr></th>
        </Show>
        <th scope="col">Pts</th>
      </tr></thead>
      <tbody><For each={props.standings}>{(standing, index) => <tr classList={{ "qualifying-row": qualified(index()) }}>
        <td class="standing-position">{index() + 1}</td>
        <th scope="row"><span class="standing-team" title={teams().get(standing.teamId)?.name}>
          <span class="standing-team-name">{props.compact ? teams().get(standing.teamId)?.shortName : teams().get(standing.teamId)?.name}</span>
          <Show when={qualified(index())}><span class="qualified-badge" title={qualificationLabel(index())}><Icon name="check" /><span class="sr-only">, {qualificationLabel(index())}</span></span></Show>
        </span></th>
        <Show when={!props.compact}>
          <td>{standing.played}</td><td class="standing-wdl">{standing.wins}</td><td class="standing-wdl">{standing.draws}</td><td class="standing-wdl">{standing.losses}</td><td class="standing-difference">{difference(standing)}</td>
        </Show>
        <td class="standing-points">{standing.points}</td>
      </tr>}</For></tbody>
    </table>
    <Show when={!props.compact}><details class="statistics"><summary>Full statistics</summary>
      <div class="table-scroll" tabindex="0" role="region" aria-label={`Pool ${props.pool} statistics, scroll for more columns`}><table class="full-statistics" aria-label={`Pool ${props.pool} detailed statistics`}><thead><tr>
        <th scope="col">Team</th><th scope="col">W</th><th scope="col">D</th><th scope="col">L</th><th scope="col">For</th><th scope="col">Against</th><th scope="col">Tries for</th><th scope="col">Tries against</th><th scope="col">TB</th><th scope="col">LB</th>
      </tr></thead><tbody><For each={props.standings}>{(standing) => <tr><th scope="row"><abbr title={teams().get(standing.teamId)?.name}>{teams().get(standing.teamId)?.shortName}</abbr></th><td>{standing.wins}</td><td>{standing.draws}</td><td>{standing.losses}</td><td>{standing.pointsFor}</td><td>{standing.pointsAgainst}</td><td>{standing.triesFor}</td><td>{standing.triesAgainst}</td><td>{standing.tryBonuses}</td><td>{standing.losingBonuses}</td></tr>}</For></tbody></table></div>
      <p>W/D/L: wins, draws, losses. TB/LB: try and losing bonus points.</p>
    </details></Show>
  </div>;
}
