import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import type { PredictionIntent, ResolvedFixture, Side } from "../domain/types";
import type { ScenarioController } from "../state/controller";
import { TeamLabel } from "./TeamLabel";
import { Icon } from "./Icon";
import { clearFixturePrediction, fixtureChoice, fixtureDateTime, fixtureTeamName } from "./FixtureCard";
import { useTimeZone } from "./timezone-context";

type NumericKey = "margin" | "homeScore" | "awayScore" | "homeTries" | "awayTries";
type BonusKey = "homeTryBonus" | "awayTryBonus" | "homeLosingBonus" | "awayLosingBonus";
type UpdateIntent = (patch: Partial<PredictionIntent>) => void;

function choiceCaption(explicit: number | undefined, suggested: number | undefined): string | undefined {
  if (explicit !== undefined) return `Your choice ${explicit}`;
  return suggested === undefined ? undefined : `Suggested ${suggested}`;
}

function NumberField(props: {
  fixtureId: number; field: NumericKey; label: string; context: string;
  explicit?: number; suggested?: number; max: number; update: UpdateIntent;
}) {
  const [error, setError] = createSignal<string>();
  let previousExplicit: number | undefined;
  createEffect(() => {
    const explicit = props.explicit;
    if (explicit !== previousExplicit) setError(undefined);
    previousExplicit = explicit;
  });
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
          props.update({ [props.field]: input.value === "" ? undefined : value });
        }} />
      <Show when={props.explicit !== undefined}><button class="field-clear" type="button"
        aria-label={`Use suggested ${props.context} ${props.label.toLowerCase()}, match ${props.fixtureId}`}
        onClick={() => { setError(undefined); props.update({ [props.field]: undefined }); }}>×</button></Show>
    </div>
    <span classList={{ "field-hint": true, "field-error": Boolean(error()) }} id={`${id()}-hint`} aria-live="polite">
      {error() ?? (props.explicit !== undefined ? "Your choice" : props.suggested !== undefined ? `Suggested ${props.suggested}` : "Optional")}
    </span>
  </div>;
}

function BonusField(props: { fixtureId: number; field: BonusKey; label: string; context: string; explicit?: boolean; suggested?: boolean; update: UpdateIntent }) {
  return <div class="bonus-field" role="group" aria-label={`${props.context} ${props.label}, match ${props.fixtureId}`}>
    <span class="bonus-label">{props.label}<small>{props.explicit !== undefined ? "Your choice" : props.suggested === undefined ? "Not yet suggested" : `Suggested ${props.suggested ? "yes" : "no"}`}</small></span>
    <div class="bonus-options"><For each={["auto", "yes", "no"] as const}>{(option) => <button type="button"
      aria-pressed={option === "auto" ? props.explicit === undefined : props.explicit === (option === "yes")}
      onClick={() => props.update({ [props.field]: option === "auto" ? undefined : option === "yes" })}>
      {option === "auto" ? "Auto" : option === "yes" ? "Yes" : "No"}
    </button>}</For></div>
  </div>;
}

export interface MatchDetailsDialogProps {
  fixture: ResolvedFixture;
  controller: ScenarioController;
  onClose: () => void;
  returnFocus?: HTMLElement | (() => HTMLElement | undefined);
  onCopyLink: () => Promise<void>;
  sharing: boolean;
  copyDisabled?: boolean;
  copyStatus?: string;
  manualUrl?: string;
}

/** One live editing session, including its dependent consequences, is one undo action. */
export function MatchDetailsDialog(props: MatchDetailsDialogProps) {
  const timeZone = useTimeZone();
  let dialog!: HTMLDialogElement;
  let closed = false;
  const intent = () => props.fixture.prediction?.intent ?? {};
  const result = () => props.fixture.result;
  const isPool = () => props.fixture.stage === "pool";
  const ready = () => Boolean(props.fixture.homeTeam && props.fixture.awayTeam);
  const group = () => `details-${props.fixture.id}`;
  const update: UpdateIntent = (patch) => props.controller.update(props.fixture.id, patch, group());
  const primaryChoice = () => fixtureChoice(props.fixture);
  const margin = () => result() ? Math.abs(result()!.homeScore - result()!.awayScore) : undefined;
  const title = () => `${fixtureTeamName(props.fixture, "home")} v ${fixtureTeamName(props.fixture, "away")}`;
  function close(): void {
    if (closed) return;
    closed = true;
    props.controller.finishGroup();
    if (dialog.open) dialog.close();
    const returnFocus = typeof props.returnFocus === "function" ? props.returnFocus() : props.returnFocus;
    props.onClose();
    queueMicrotask(() => { if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); });
  }
  function clear(): void {
    props.controller.finishGroup();
    clearFixturePrediction(props.controller, props.fixture.id);
    close();
  }
  const losingBonus = (side: Side) => {
    const score = result();
    if (!score) return undefined;
    const margin = score.homeScore - score.awayScore;
    return side === "home" ? margin < 0 && margin >= -7 : margin > 0 && margin <= 7;
  };
  onMount(() => {
    props.controller.finishGroup();
    dialog.showModal();
    (dialog.querySelector<HTMLButtonElement>(".detail-winner-options button:not(:disabled)")
      ?? dialog.querySelector<HTMLButtonElement>(".match-dialog-close"))?.focus();
  });
  onCleanup(() => {
    closed = true;
    props.controller.finishGroup();
    if (dialog.open) dialog.close();
  });

  return <dialog ref={(element) => { dialog = element; }} id={`match-${props.fixture.id}-details-dialog`} class="match-dialog"
    aria-labelledby={`match-${props.fixture.id}-dialog-title`} aria-describedby={`match-${props.fixture.id}-dialog-meta match-${props.fixture.id}-dialog-venue`}
    onCancel={(event) => { event.preventDefault(); close(); }} onClose={close}
    onClick={(event) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
    }}>
    <div class="match-dialog-header">
      <div><h2 class="match-dialog-title" id={`match-${props.fixture.id}-dialog-title`}>{title()}</h2>
        <p class="match-dialog-meta" id={`match-${props.fixture.id}-dialog-meta`}>Match {props.fixture.id} · {fixtureDateTime(props.fixture, timeZone())}</p>
        <p class="match-dialog-venue" id={`match-${props.fixture.id}-dialog-venue`}>{props.fixture.venue}</p>
      </div>
      <button type="button" class="match-dialog-close" aria-label="Close match details" onClick={close}><Icon name="close" size={20} /></button>
    </div>
    <Show when={result()}><div class="match-dialog-preview" aria-live="polite"><strong>{result()!.homeScore} – {result()!.awayScore}</strong>
      <span>{result()!.homeTries} – {result()!.awayTries} tries</span>
    </div></Show>
    <Show when={!ready()}><p class="match-dialog-waiting" role="status">Waiting on earlier picks. Complete the earlier matches to edit this game.</p></Show>
    <Show when={props.fixture.issues.length > 0}><ul class="fixture-issues" aria-live="polite"><For each={props.fixture.issues}>{(issue) => <li>{issue}</li>}</For></ul></Show>
    <fieldset class="detail-fields" disabled={!ready()}>
      <legend class="sr-only">Match {props.fixture.id} scoring details</legend>
      <div class="detail-section" role="group" aria-label={`${isPool() ? "Winner" : "Advancing team"}, match ${props.fixture.id}`}>
        <span class="detail-label">{isPool() ? "Winner" : "Advancing team"}</span>
        <div class="detail-options detail-winner-options"><For each={["home", "away"] as const}>{(side) => <button type="button" aria-pressed={primaryChoice() === side}
          onClick={() => update(isPool() ? { winner: side } : { advancing: side })}>{fixtureTeamName(props.fixture, side)}</button>}</For></div>
      </div>
      <div class="detail-section" role="group" aria-label={`Winning margin, match ${props.fixture.id}`}>
        <span class="detail-label">Margin<Show when={choiceCaption(intent().margin, margin())}>{(caption) => <small>{caption()}</small>}</Show></span>
        <div class="detail-options"><For each={[20, 15, 10, 7, 5]}>{(margin) => <button type="button" aria-pressed={intent().margin === margin}
          onClick={() => update({ margin })}>by {margin}</button>}</For><Show when={isPool()}><button type="button" aria-pressed={primaryChoice() === "draw"}
            onClick={() => update({ winner: "draw" })}>Draw</button></Show></div>
      </div>
      <div class="detail-section"><span class="detail-label">Tries</span><For each={["home", "away"] as const}>{(side) => {
        const field = side === "home" ? "homeTries" : "awayTries";
        return <div class="detail-tries-row" role="group" aria-label={`${fixtureTeamName(props.fixture, side)} tries, match ${props.fixture.id}`}>
          <span>{fixtureTeamName(props.fixture, side)}<Show when={choiceCaption(intent()[field], result()?.[field])}>{(caption) => <small>{caption()}</small>}</Show></span><div class="detail-options"><For each={[0, 1, 2, 3, 4, 5, 6, 7]}>{(tries) => <button type="button"
            aria-pressed={intent()[field] === tries} onClick={() => update({ [field]: tries })}>{tries}</button>}</For></div>
        </div>;
      }}</For></div>
      <details class="detail-advanced"><summary>Exact scores &amp; bonus points</summary>
        <Show when={!isPool()}><div class="regulation-result" role="group" aria-label={`Regulation result, match ${props.fixture.id}`}>
          <span class="detail-label">Regulation result</span>
          <div class="regulation-options"><For each={["home", "draw", "away"] as const}>{(winner) => <button type="button" aria-pressed={intent().winner === winner}
            onClick={() => update({ winner })}>{winner === "draw" ? "Draw" : fixtureTeamName(props.fixture, winner)}</button>}</For>
            <button type="button" aria-pressed={intent().winner === undefined} onClick={() => update({ winner: undefined })}>Auto</button>
          </div>
        </div></Show>
        <div class="margin-row"><NumberField fixtureId={props.fixture.id} field="margin" label="Winning margin" context="Match" explicit={intent().margin}
          suggested={result() ? Math.abs(result()!.homeScore - result()!.awayScore) : undefined} max={255} update={update} /></div>
        <div class="scoring-columns"><For each={["home", "away"] as const}>{(side) => <div class="team-details">
          <h3><TeamLabel team={props.fixture[side === "home" ? "homeTeam" : "awayTeam"]} fallback={fixtureTeamName(props.fixture, side)} /></h3>
          <div class="score-inputs">
            <NumberField fixtureId={props.fixture.id} field={side === "home" ? "homeScore" : "awayScore"} label="Points" context={fixtureTeamName(props.fixture, side)}
              explicit={intent()[side === "home" ? "homeScore" : "awayScore"]} suggested={result()?.[side === "home" ? "homeScore" : "awayScore"]} max={255} update={update} />
            <NumberField fixtureId={props.fixture.id} field={side === "home" ? "homeTries" : "awayTries"} label="Tries" context={fixtureTeamName(props.fixture, side)}
              explicit={intent()[side === "home" ? "homeTries" : "awayTries"]} suggested={result()?.[side === "home" ? "homeTries" : "awayTries"]} max={15} update={update} />
          </div>
          <Show when={isPool()}>
            <BonusField fixtureId={props.fixture.id} field={side === "home" ? "homeTryBonus" : "awayTryBonus"} label="Try bonus" context={fixtureTeamName(props.fixture, side)}
              explicit={intent()[side === "home" ? "homeTryBonus" : "awayTryBonus"]} suggested={result() ? result()![side === "home" ? "homeTries" : "awayTries"] >= 4 : undefined} update={update} />
            <BonusField fixtureId={props.fixture.id} field={side === "home" ? "homeLosingBonus" : "awayLosingBonus"} label="Losing bonus" context={fixtureTeamName(props.fixture, side)}
              explicit={intent()[side === "home" ? "homeLosingBonus" : "awayLosingBonus"]} suggested={losingBonus(side)} update={update} />
          </Show>
        </div>}</For></div>
      </details>
    </fieldset>
    <div class="details-bottom"><button type="button" class="detail-clear" disabled={!ready() || !props.fixture.prediction} onClick={clear}>Clear pick</button>
      <button type="button" class="icon-button match-dialog-copy" aria-label="Copy match link" title="Copy match link"
        disabled={props.sharing || props.copyDisabled} aria-busy={props.sharing} onClick={() => void props.onCopyLink()}><Icon name="link" /></button>
      <button type="button" class="detail-done" onClick={close}>Done</button></div>
    <div class="match-dialog-share-status" role="status" aria-live="polite">{props.copyStatus}</div>
    <Show when={props.manualUrl}><label class="manual-share match-dialog-manual-link">Your match link<input type="text" readonly value={props.manualUrl}
      onFocus={(event) => event.currentTarget.select()} /></label></Show>
  </dialog>;
}
