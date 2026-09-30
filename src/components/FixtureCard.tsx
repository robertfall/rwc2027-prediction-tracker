import { For, Show, createSignal } from "solid-js";
import type { PredictionIntent, ResolvedFixture, Side } from "../domain/types";
import type { ScenarioController } from "../state/controller";
import { TeamLabel, sourceLabel } from "./TeamLabel";

const intentKeys = ["winner", "advancing", "margin", "homeScore", "awayScore", "homeTries", "awayTries", "homeTryBonus", "awayTryBonus", "homeLosingBonus", "awayLosingBonus"] as const;
const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
type NumericKey = "margin" | "homeScore" | "awayScore" | "homeTries" | "awayTries";

function NumberField(props: {
  fixtureId: number; field: NumericKey; label: string; context: string;
  explicit?: number; suggested?: number; max: number; controller: ScenarioController;
}) {
  const [error, setError] = createSignal<string>();
  const id = () => `match-${props.fixtureId}-${props.field}`;
  return <div class="number-field">
    <label for={id()}>{props.label}</label>
    <div class="number-input-wrap">
      <input id={id()} name={props.field} type="number" inputMode="numeric" min="0" max={props.max} step="1"
        value={props.explicit ?? ""} placeholder={props.suggested === undefined ? "—" : String(props.suggested)}
        classList={{ "is-explicit": props.explicit !== undefined }}
        aria-label={`${props.context} ${props.label.toLowerCase()}, match ${props.fixtureId}`}
        aria-invalid={error() ? "true" : undefined} aria-describedby={`${id()}-hint`}
        onInput={(event) => {
          const input = event.currentTarget;
          const value = input.valueAsNumber;
          if (input.validity.badInput || (input.value !== "" && (!Number.isInteger(value) || value < 0 || value > props.max))) {
            setError(`Use a whole number from 0 to ${props.max}.`);
            return;
          }
          setError(undefined);
          props.controller.update(props.fixtureId, { [props.field]: input.value === "" ? undefined : value }, id());
        }}
        onBlur={() => props.controller.finishGroup()} />
      <Show when={props.explicit !== undefined}><button class="field-clear" type="button" aria-label={`Use suggested ${props.context} ${props.label.toLowerCase()}, match ${props.fixtureId}`}
        onClick={() => { props.controller.finishGroup(); setError(undefined); props.controller.update(props.fixtureId, { [props.field]: undefined }); }}>×</button></Show>
    </div>
    <span classList={{ "field-hint": true, "field-error": Boolean(error()) }} id={`${id()}-hint`}>
      {error() ?? (props.explicit !== undefined ? "Your choice" : props.suggested !== undefined ? `Suggested ${props.suggested}` : "Optional")}
    </span>
  </div>;
}

type BonusKey = "homeTryBonus" | "awayTryBonus" | "homeLosingBonus" | "awayLosingBonus";
function BonusField(props: { fixtureId: number; field: BonusKey; label: string; context: string; explicit?: boolean; suggested?: boolean; controller: ScenarioController }) {
  return <div class="bonus-field" role="group" aria-label={`${props.context} ${props.label}, match ${props.fixtureId}`}>
    <span class="bonus-label">{props.label}<small>{props.explicit !== undefined ? "Your choice" : props.suggested === undefined ? "Not yet suggested" : `Suggested ${props.suggested ? "yes" : "no"}`}</small></span>
    <div class="bonus-options">
      <For each={["auto", "yes", "no"] as const}>{(option) => <button type="button"
        aria-pressed={option === "auto" ? props.explicit === undefined : props.explicit === (option === "yes")}
        onClick={() => props.controller.update(props.fixtureId, { [props.field]: option === "auto" ? undefined : option === "yes" })}>
        {option === "auto" ? "Auto" : option === "yes" ? "Yes" : "No"}
      </button>}</For>
    </div>
  </div>;
}

export function FixtureCard(props: { fixture: ResolvedFixture; controller: ScenarioController }) {
  const [expanded, setExpanded] = createSignal(false);
  const intent = () => props.fixture.prediction?.intent ?? {};
  const isPool = () => props.fixture.stage === "pool";
  const selected = () => isPool() ? intent().winner : intent().advancing;
  const ready = () => Boolean(props.fixture.homeTeam && props.fixture.awayTeam);
  const teamName = (side: Side) => props.fixture[side === "home" ? "homeTeam" : "awayTeam"]?.name ?? sourceLabel(props.fixture[side]);
  const score = () => props.fixture.result;
  const tryBonus = (side: Side) => score() ? score()![side === "home" ? "homeTries" : "awayTries"] >= 4 : undefined;
  const losingBonus = (side: Side) => {
    const result = score();
    if (!result) return undefined;
    const margin = result.homeScore - result.awayScore;
    return side === "home" ? margin < 0 && margin >= -7 : margin > 0 && margin <= 7;
  };
  const choose = (side: "home" | "away" | "draw") => props.controller.update(props.fixture.id, isPool() ? { winner: side } : { advancing: side as Side });
  const clear = () => {
    const patch: Partial<PredictionIntent> = {};
    for (const key of intentKeys) patch[key] = undefined;
    props.controller.update(props.fixture.id, patch);
  };
  return <article data-fixture-id={props.fixture.id} classList={{ "fixture-card": true, "has-prediction": Boolean(props.fixture.result), "has-conflict": props.fixture.issues.length > 0 }} aria-label={`Match ${props.fixture.id}: ${teamName("home")} versus ${teamName("away")}`}>
    <div class="fixture-meta"><span>Match {props.fixture.id}</span><time dateTime={props.fixture.kickoff}>{dateFormat.format(new Date(props.fixture.kickoff))}</time></div>
    <fieldset class="fixture-edit" disabled={!ready()}>
      <legend class="sr-only">{isPool() ? "Pick the match result" : "Pick the team to advance"}</legend>
      <div class="winner-options">
        <button type="button" class="winner-choice" aria-pressed={selected() === "home"} onClick={() => choose("home")}>
          <TeamLabel team={props.fixture.homeTeam} fallback={sourceLabel(props.fixture.home)} />
          <span class="winner-mark" aria-hidden="true">{selected() === "home" ? "✓" : ""}</span>
        </button>
        <Show when={isPool()}><button type="button" class="draw-choice" aria-pressed={selected() === "draw"} onClick={() => choose("draw")}>Draw</button></Show>
        <button type="button" class="winner-choice" aria-pressed={selected() === "away"} onClick={() => choose("away")}>
          <TeamLabel team={props.fixture.awayTeam} fallback={sourceLabel(props.fixture.away)} />
          <span class="winner-mark" aria-hidden="true">{selected() === "away" ? "✓" : ""}</span>
        </button>
      </div>
    </fieldset>
    <div class="fixture-footer">
      <span class="result-preview"><Show when={score()} fallback={<span>{ready() ? (isPool() ? "Pick a winner or draw" : "Pick a team to advance") : "Waiting for qualifying teams"}</span>}>
        <strong>{score()!.homeScore} – {score()!.awayScore}</strong><span>{score()!.homeTries} – {score()!.awayTries} tries</span>
      </Show></span>
      <button type="button" class="details-toggle" aria-expanded={expanded()} aria-controls={`match-${props.fixture.id}-details`} onClick={() => setExpanded(!expanded())}>Details <span aria-hidden="true">{expanded() ? "−" : "+"}</span></button>
    </div>
    <Show when={props.fixture.issues.length}><ul class="fixture-issues" aria-live="polite"><For each={props.fixture.issues}>{(issue) => <li>{issue}</li>}</For></ul></Show>
    <Show when={expanded()}>
      <fieldset id={`match-${props.fixture.id}-details`} class="fixture-details" disabled={!ready()}>
        <legend class="sr-only">Match {props.fixture.id} scoring details</legend>
        <p class="details-note">Suggested details fill the gaps. Clear a field to use its suggestion.</p>
        <Show when={!isPool()}><div class="regulation-result" role="group" aria-label={`Regulation result, match ${props.fixture.id}`}>
          <span>Regulation result</span>
          <div class="regulation-options"><For each={["home", "draw", "away"] as const}>{(winner) => <button type="button" aria-pressed={intent().winner === winner}
            onClick={() => props.controller.update(props.fixture.id, { winner })}>{winner === "draw" ? "Draw" : teamName(winner)}</button>}</For>
            <button type="button" aria-pressed={intent().winner === undefined} onClick={() => props.controller.update(props.fixture.id, { winner: undefined })}>Auto</button>
          </div>
          <small>Advancement can be decided after a regulation draw.</small>
        </div></Show>
        <div class="margin-row"><NumberField fixtureId={props.fixture.id} field="margin" label="Winning margin" context="Match" explicit={intent().margin}
          suggested={score() ? Math.abs(score()!.homeScore - score()!.awayScore) : undefined} max={255} controller={props.controller} /></div>
        <div class="scoring-columns"><For each={["home", "away"] as const}>{(side) => <div class="team-details">
          <h4><TeamLabel team={props.fixture[side === "home" ? "homeTeam" : "awayTeam"]} fallback={teamName(side)} /></h4>
          <div class="score-inputs">
            <NumberField fixtureId={props.fixture.id} field={side === "home" ? "homeScore" : "awayScore"} label="Points" context={teamName(side)}
              explicit={intent()[side === "home" ? "homeScore" : "awayScore"]} suggested={score()?.[side === "home" ? "homeScore" : "awayScore"]} max={255} controller={props.controller} />
            <NumberField fixtureId={props.fixture.id} field={side === "home" ? "homeTries" : "awayTries"} label="Tries" context={teamName(side)}
              explicit={intent()[side === "home" ? "homeTries" : "awayTries"]} suggested={score()?.[side === "home" ? "homeTries" : "awayTries"]} max={15} controller={props.controller} />
          </div>
          <Show when={isPool()}>
            <BonusField fixtureId={props.fixture.id} field={side === "home" ? "homeTryBonus" : "awayTryBonus"} label="Try bonus" context={teamName(side)}
              explicit={intent()[side === "home" ? "homeTryBonus" : "awayTryBonus"]} suggested={tryBonus(side)} controller={props.controller} />
            <BonusField fixtureId={props.fixture.id} field={side === "home" ? "homeLosingBonus" : "awayLosingBonus"} label="Losing bonus" context={teamName(side)}
              explicit={intent()[side === "home" ? "homeLosingBonus" : "awayLosingBonus"]} suggested={losingBonus(side)} controller={props.controller} />
          </Show>
        </div>}</For></div>
        <div class="details-bottom"><span>{props.fixture.venue}</span><button type="button" class="text-button" disabled={!props.fixture.prediction} onClick={clear}>Clear match</button></div>
      </fieldset>
    </Show>
  </article>;
}
