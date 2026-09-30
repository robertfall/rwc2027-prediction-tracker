import { Show } from "solid-js";
import type { Team, TeamSource } from "../domain/types";

export function sourceLabel(source: TeamSource): string {
  if (source.kind === "team") return source.teamId;
  if (source.kind === "pool") return `Pool ${source.pool} ${source.position === 1 ? "winner" : "runner-up"}`;
  if (source.kind === "third") return "Best third-place team";
  return `${source.kind === "winner" ? "Winner" : "Loser"} of match ${source.fixtureId}`;
}

export function TeamLabel(props: { team?: Team; fallback?: string; short?: boolean }) {
  return <span class="team-label">
    <Show when={props.team}><img class="team-flag" src={`${import.meta.env.BASE_URL}flags/4x3/${props.team!.flag}.svg`} alt="" width="24" height="18" loading="lazy" /></Show>
    <span>{props.team ? (props.short ? props.team.shortName : props.team.name) : props.fallback}</span>
  </span>;
}
