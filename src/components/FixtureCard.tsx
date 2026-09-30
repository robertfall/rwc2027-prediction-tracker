import { For, Show } from "solid-js";
import type { PredictionIntent, ResolvedFixture, Side, Winner } from "../domain/types";
import { intentFields } from "../domain/completion";
import type { ScenarioController } from "../state/controller";
import { TeamLabel, sourceLabel } from "./TeamLabel";
import { Icon } from "./Icon";

const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const stageNames = { pool: "Pool", round16: "R16", quarter: "QF", semi: "SF", bronze: "Bronze", final: "Final" } as const;

export function fixtureDateTime(fixture: ResolvedFixture): string {
  const date = new Date(fixture.kickoff);
  return `${dateFormat.format(date)} · ${timeFormat.format(date)}`;
}

export function fixtureTeamName(fixture: ResolvedFixture, side: Side): string {
  return fixture[side === "home" ? "homeTeam" : "awayTeam"]?.name ?? sourceLabel(fixture[side]);
}

export function fixtureChoice(fixture: ResolvedFixture): Winner | undefined {
  const intent = fixture.prediction?.intent;
  return fixture.stage === "pool" ? intent?.winner ?? fixture.result?.winner : intent?.advancing ?? fixture.result?.advancing;
}

export function clearFixturePrediction(controller: ScenarioController, id: number): void {
  const patch: Partial<PredictionIntent> = {};
  for (const field of intentFields) patch[field] = undefined;
  controller.update(id, patch);
}

export interface FixtureCardProps {
  fixture: ResolvedFixture;
  controller: ScenarioController;
  variant?: "card" | "row" | "bracket";
  onDetails: (fixtureId: number, trigger: HTMLButtonElement) => void;
  note?: string;
}

export function FixtureCard(props: FixtureCardProps) {
  const variant = () => props.variant ?? "card";
  const isPool = () => props.fixture.stage === "pool";
  const ready = () => Boolean(props.fixture.homeTeam && props.fixture.awayTeam);
  const selected = () => fixtureChoice(props.fixture);
  const result = () => props.fixture.result;
  const margin = () => result() ? Math.abs(result()!.homeScore - result()!.awayScore) : undefined;
  function choose(side: Winner): void {
    props.controller.finishGroup();
    if (selected() === side) clearFixturePrediction(props.controller, props.fixture.id);
    else props.controller.update(props.fixture.id, isPool() ? { winner: side } : { advancing: side as Side });
  }
  const openDetails = (trigger: HTMLButtonElement) => props.onDetails(props.fixture.id, trigger);
  const drawButton = () => <button type="button" class="draw-choice" aria-pressed={selected() === "draw"}
    disabled={!ready()} onClick={() => choose("draw")}><Show when={selected() === "draw"}><Icon name="check" size={14} /></Show>Draw</button>;
  const teamButton = (side: Side) => <button type="button" class="winner-choice"
    classList={{ "is-selected": selected() === side, "has-other-pick": selected() !== undefined && selected() !== side }}
    aria-pressed={selected() === side} disabled={!ready()} title={fixtureTeamName(props.fixture, side)} onClick={() => choose(side)}>
    <TeamLabel team={props.fixture[side === "home" ? "homeTeam" : "awayTeam"]} fallback={sourceLabel(props.fixture[side])} />
    <Show when={variant() === "bracket"} fallback={<span class="winner-mark" aria-hidden="true"><Show when={selected() === side}><Icon name="check" size={16} /></Show></span>}>
      <span class="bracket-score" aria-hidden="true"><Show when={result() && selected() === side}>{result()!.winner === "draw" ? "Adv." : `+${margin()}`}</Show></span>
    </Show>
  </button>;

  return <article data-fixture-id={props.fixture.id} classList={{
    "fixture-card": true, "fixture-card--card": variant() === "card", "fixture-card--row": variant() === "row",
    "fixture-card--bracket": variant() === "bracket", "has-prediction": Boolean(result()), "has-conflict": props.fixture.issues.length > 0,
  }} aria-label={`Match ${props.fixture.id}: ${fixtureTeamName(props.fixture, "home")} versus ${fixtureTeamName(props.fixture, "away")}`}>
    <Show when={variant() === "row"} fallback={<Show when={variant() === "bracket"} fallback={
      <div class="fixture-meta"><span>Match {props.fixture.id}</span><time dateTime={props.fixture.kickoff}>{fixtureDateTime(props.fixture)}</time></div>
    }>
      <button type="button" class="fixture-meta fixture-bracket-header" disabled={!ready()} aria-label={`Details for match ${props.fixture.id}`}
        aria-haspopup="dialog" aria-controls={`match-${props.fixture.id}-details-dialog`} onClick={(event) => openDetails(event.currentTarget)}>
        <span>Match {props.fixture.id}</span><time dateTime={props.fixture.kickoff}>{fixtureDateTime(props.fixture)}</time>
      </button>
    </Show>}>
      <div class="fixture-row-time"><time dateTime={props.fixture.kickoff}>{timeFormat.format(new Date(props.fixture.kickoff))}</time>
        <span>{isPool() ? `Pool ${props.fixture.pool}` : stageNames[props.fixture.stage]} · M{props.fixture.id}</span>
      </div>
    </Show>
    <fieldset class="fixture-edit" disabled={!ready()}>
      <legend class="sr-only">{isPool() ? "Pick the match result" : "Pick the team to advance"}</legend>
      <div class="winner-options">{teamButton("home")}<Show when={variant() === "row" && isPool()}>{drawButton()}</Show>{teamButton("away")}</div>
      <Show when={variant() === "card" && isPool()}><div class="fixture-draw">{drawButton()}</div></Show>
    </fieldset>
    <Show when={variant() !== "bracket"}><div class="fixture-footer">
      <span class="result-preview"><Show when={result()} fallback={<span>{ready() ? "No pick yet" : "Waiting on earlier picks"}</span>}>
        <strong>{result()!.winner === "draw" ? "Draw" : `By ${margin()}`}</strong><span>{result()!.homeTries} – {result()!.awayTries} tries</span>
      </Show></span>
      <button type="button" class="details-toggle" disabled={!ready()} title="Margin and tries"
        aria-label={`Details for match ${props.fixture.id}`} aria-haspopup="dialog" aria-controls={`match-${props.fixture.id}-details-dialog`}
        onClick={(event) => openDetails(event.currentTarget)}><Icon name="sliders" size={18} /></button>
    </div></Show>
    <Show when={props.fixture.issues.length > 0}><ul class="fixture-issues" aria-live="polite"><For each={props.fixture.issues}>{(issue) => <li>{issue}</li>}</For></ul></Show>
    <Show when={props.note && variant() === "row"}><p class="fixture-note"><Icon name="arrow-right" size={14} />{props.note}</p></Show>
  </article>;
}
