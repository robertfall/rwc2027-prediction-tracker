import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";
import type { DerivedScenario, Stage } from "../domain/types";
import type { ScenarioController } from "../state/controller";
import { FixtureCard } from "./FixtureCard";
import { Icon } from "./Icon";
import { StandingsTable } from "./StandingsTable";
import { bracketOrder, byKickoff, dateRange, isCompleted, placedTeam, progressionNote, stageLabels, stageOrder, timelineGroups } from "./tournament-view-model";

export interface TournamentViewProps {
  derived: DerivedScenario;
  controller: ScenarioController;
  onDetails: (id: number, trigger: HTMLButtonElement) => void;
}

function viewModel(props: { derived: DerivedScenario }) {
  const tournament = createMemo(() => props.derived.tournament);
  const fixtures = createMemo(() => new Map(props.derived.fixtures.map((fixture) => [fixture.id, fixture])));
  const fixture = (id: number) => fixtures().get(id)!;
  const picked = (ids: number[]) => ids.filter((id) => isCompleted(fixture(id))).length;
  const range = (ids: number[]) => dateRange(ids.map(fixture));
  return { tournament, fixture, picked, range };
}

export function PoolsByPool(props: TournamentViewProps & { filter?: string }) {
  const model = viewModel(props);
  const pools = createMemo(() => model.tournament().pools.filter((pool) => !props.filter || props.filter === "all" || props.filter === pool.id).map((pool) => pool.id));
  const matches = (pool: string) => model.tournament().fixtures.filter((fixture) => fixture.stage === "pool" && fixture.pool === pool).sort(byKickoff).map((fixture) => fixture.id);
  return <div class="pools-by-pool"><For each={pools()}>{(pool) => <section class="pool-section" id={`pool-${pool}`} data-pool-id={pool} aria-labelledby={`pool-${pool}-heading`}>
    <div class="pool-layout">
      <div class="pool-matches"><For each={matches(pool)}>{(id) => <FixtureCard fixture={model.fixture(id)} controller={props.controller} onDetails={props.onDetails} variant="card" />}</For></div>
      <aside class="pool-context"><div class="pool-heading"><h2 id={`pool-${pool}-heading`}>Pool {pool}</h2><span>{model.picked(matches(pool))} / {matches(pool).length} picked</span></div>
        <StandingsTable pool={pool} standings={props.derived.standings[pool] ?? []} teams={model.tournament().teams} complete={props.derived.poolsComplete} thirdQualified={props.derived.qualifiedThirdPools.includes(pool)} />
      </aside>
    </div>
  </section>}</For></div>;
}

const dayNumberFormat = new Intl.DateTimeFormat(undefined, { day: "2-digit" });
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const monthFormat = new Intl.DateTimeFormat(undefined, { month: "short" });

export function Timeline(props: TournamentViewProps & { phase: "pools" | "knockout"; filter?: string }) {
  const model = viewModel(props);
  const groups = createMemo(() => timelineGroups(model.tournament(), props.phase, props.filter));
  const groupKeys = createMemo(() => groups().map((group) => group.key));
  const group = (key: string) => groups().find((candidate) => candidate.key === key)!;
  const pools = createMemo(() => model.tournament().pools.map((pool) => pool.id));
  return <div class="timeline-layout">
    <div class="timeline-main"><For each={groupKeys()}>{(key) => <section class="timeline-group" aria-labelledby={`timeline-${key}-heading`}>
      <div class="timeline-heading"><h2 id={`timeline-${key}-heading`}>{group(key).label}</h2><span>{model.range(group(key).fixtureIds)}</span><span class="timeline-progress">{model.picked(group(key).fixtureIds)} / {group(key).fixtureIds.length} picked</span></div>
      <For each={group(key).days.map((day) => day.key)}>{(dayKey) => {
        const day = () => group(key).days.find((candidate) => candidate.key === dayKey)!;
        const date = () => new Date(day().kickoff);
        return <div class="timeline-day" data-date-key={dayKey}>
          <div class="timeline-date"><time dateTime={dayKey}><span class="timeline-day-number">{dayNumberFormat.format(date())}</span><span class="timeline-weekday">{weekdayFormat.format(date())}</span><span class="timeline-month">{monthFormat.format(date())}</span></time></div>
          <div class="timeline-matches"><For each={day().fixtureIds}>{(id) => <FixtureCard fixture={model.fixture(id)} controller={props.controller} onDetails={props.onDetails} variant="card" />}</For></div>
        </div>;
      }}</For>
    </section>}</For></div>
    <aside class="timeline-context"><Show when={props.phase === "pools"} fallback={<TournamentFinish derived={props.derived} />}>
      <h2 class="context-heading">Standings</h2><div class="compact-standings-grid"><For each={pools()}>{(pool) => <StandingsTable compact pool={pool} standings={props.derived.standings[pool] ?? []} teams={model.tournament().teams} complete={props.derived.poolsComplete} thirdQualified={props.derived.qualifiedThirdPools.includes(pool)} />}</For></div>
    </Show></aside>
  </div>;
}

export function KnockoutRounds(props: TournamentViewProps) {
  const model = viewModel(props);
  const stages = createMemo(() => stageOrder.filter((stage) => model.tournament().fixtures.some((fixture) => fixture.stage === stage)));
  const matches = (stage: Stage) => model.tournament().fixtures.filter((fixture) => fixture.stage === stage).sort(byKickoff).map((fixture) => fixture.id);
  return <div class="knockout-rounds"><For each={stages()}>{(stage) => <section class={`knockout-stage stage-${stage}`} aria-labelledby={`round-${stage}-heading`}>
    <div class="round-heading"><h2 id={`round-${stage}-heading`}>{stageLabels[stage]}</h2><span>{model.range(matches(stage))} · {model.picked(matches(stage))} / {matches(stage).length} picked</span></div>
    <div class="round-matches"><For each={matches(stage)}>{(id) => <FixtureCard fixture={model.fixture(id)} controller={props.controller} onDetails={props.onDetails} variant="card" />}</For></div>
  </section>}</For></div>;
}

export function TournamentFinish(props: { derived: DerivedScenario }) {
  const final = () => props.derived.fixtures.find((fixture) => fixture.stage === "final");
  const bronze = () => props.derived.fixtures.find((fixture) => fixture.stage === "bronze");
  const champion = () => placedTeam(final());
  const runnersUp = () => placedTeam(final(), true);
  const bronzeTeam = () => placedTeam(bronze());
  const fourth = () => placedTeam(bronze(), true);
  return <div class="tournament-finish"><div class="finish-champion"><h2><Icon name="trophy" />Your champion</h2><strong>{champion()?.name ?? "Not picked yet"}</strong></div>
    <dl class="finish-places"><div><dt>Runner-up</dt><dd>{runnersUp()?.name ?? "—"}</dd></div><div><dt>Bronze</dt><dd>{bronzeTeam()?.name ?? "—"}</dd></div><div><dt>Fourth</dt><dd>{fourth()?.name ?? "—"}</dd></div></dl>
  </div>;
}

export function KnockoutBracket(props: TournamentViewProps) {
  const model = viewModel(props);
  const mobileQuery = window.matchMedia("(max-width: 719px)");
  const [mobile, setMobile] = createSignal(mobileQuery.matches);
  const resized = () => setMobile(mobileQuery.matches);
  mobileQuery.addEventListener("change", resized);
  onCleanup(() => mobileQuery.removeEventListener("change", resized));
  const order = createMemo(() => bracketOrder(model.tournament()));
  const stages = createMemo(() => ["round16", "quarter", "semi", "final"].filter((stage) => order().has(stage as Stage)) as Stage[]);
  const [selected, setSelected] = createSignal<Stage>("round16");
  const selectedStage = () => stages().includes(selected()) ? selected() : stages()[0];
  const ids = (stage: Stage) => order().get(stage) ?? [];
  const bronzeIds = createMemo(() => model.tournament().fixtures.filter((fixture) => fixture.stage === "bronze").map((fixture) => fixture.id));
  const mobileIds = () => selectedStage() === "final" ? [...ids("final"), ...bronzeIds()] : [...ids(selectedStage())].sort((a, b) => byKickoff(model.fixture(a), model.fixture(b)));
  const nextStage = (stage: Stage) => stages()[stages().indexOf(stage) + 1];
  const pairs = (stage: Stage) => ids(nextStage(stage)).filter((id) => {
    const next = model.fixture(id);
    return [next.home, next.away].some((source) => source.kind === "winner" && model.fixture(source.fixtureId).stage === stage);
  });
  const feeds = (nextId: number, stage: Stage) => [model.fixture(nextId).home, model.fixture(nextId).away].flatMap((source) => source.kind === "winner" && model.fixture(source.fixtureId).stage === stage ? [source.fixtureId] : []);
  const note = (id: number) => progressionNote(model.fixture(id), model.tournament());
  return <div class="knockout-bracket"><Show when={mobile()} fallback={
    <div class="bracket-scroll" tabindex="0" role="region" aria-label="Tournament bracket, scroll for more rounds"><div class="bracket-grid" style={{ "--bracket-columns": stages().length }}>
      <For each={stages()}>{(stage) => <section class={`bracket-column bracket-column--${stage}`} data-bracket-stage={stage} aria-labelledby={`bracket-${stage}-heading`}>
        <div class="bracket-heading"><h2 id={`bracket-${stage}-heading`}>{stageLabels[stage]}</h2><span>{model.range(ids(stage))}</span></div>
        <Show when={stage === "final"} fallback={<div class="bracket-column-body"><For each={pairs(stage)}>{(nextId) => <div class="bracket-pair" data-next-fixture-id={nextId}>
          <For each={feeds(nextId, stage)}>{(id) => <div class="bracket-match-wrap"><FixtureCard fixture={model.fixture(id)} controller={props.controller} onDetails={props.onDetails} variant="bracket" note={note(id)} /></div>}</For>
          <span class="bracket-link-vertical" aria-hidden="true" /><span class="bracket-link-horizontal" aria-hidden="true" />
        </div>}</For></div>}>
          <div class="bracket-column-body bracket-finals"><For each={ids(stage)}>{(id) => <div class="bracket-match-wrap">
            <FixtureCard fixture={model.fixture(id)} controller={props.controller} onDetails={props.onDetails} variant="bracket" note={note(id)} />
            <div class="bracket-finals-followup"><TournamentFinish derived={props.derived} />
              <For each={bronzeIds()}>{(bronzeId) => <div class="bracket-bronze"><h3>Bronze final</h3><FixtureCard fixture={model.fixture(bronzeId)} controller={props.controller} onDetails={props.onDetails} variant="bracket" note={note(bronzeId)} /></div>}</For>
            </div>
          </div>}</For>
          </div>
        </Show>
      </section>}</For>
    </div></div>
  }>
    <div class="bracket-mobile" data-bracket-round={selectedStage()}>
      <div class="bracket-round-nav" role="group" aria-label="Bracket round"><For each={stages()}>{(stage) => <button type="button" aria-pressed={selectedStage() === stage} aria-label={stage === "final" ? "Finals" : stageLabels[stage]} onClick={() => setSelected(stage)}>{stage === "round16" ? "R16" : stage === "quarter" ? "QF" : stage === "semi" ? "SF" : "Finals"}</button>}</For></div>
      <p class="bracket-round-range">{selectedStage() === "final" ? "Finals" : stageLabels[selectedStage()]} · {model.range(mobileIds())}</p>
      <Show when={selectedStage() === "final"}><TournamentFinish derived={props.derived} /></Show>
      <div class="bracket-mobile-matches"><For each={mobileIds()}>{(id) => <div class="bracket-match-wrap"><Show when={selectedStage() === "final"}><h2>{stageLabels[model.fixture(id).stage]}</h2></Show><FixtureCard fixture={model.fixture(id)} controller={props.controller} onDetails={props.onDetails} variant="bracket" note={note(id)} /></div>}</For></div>
    </div>
  </Show></div>;
}
