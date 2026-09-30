import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";
import { createBrowserController } from "./state/browser";
import type { ResolvedFixture, Stage } from "./domain/types";
import { FixtureCard } from "./components/FixtureCard";
import { StandingsTable } from "./components/StandingsTable";
import "./App.css";

const stageNames: Record<Stage, string> = {
  pool: "Pools", round16: "Round of 16", quarter: "Quarter-finals",
  semi: "Semi-finals", bronze: "Bronze final", final: "Final",
};
const stages: Stage[] = ["round16", "quarter", "semi", "bronze", "final"];

function App() {
  const browser = createBrowserController();
  const controller = browser.controller;
  const [state, setState] = createSignal(controller.getState());
  const [urlError, setUrlError] = createSignal(browser.urlError());
  const [view, setView] = createSignal<"pools" | "knockout">("pools");
  const [copyStatus, setCopyStatus] = createSignal("");
  const [manualUrl, setManualUrl] = createSignal("");
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = browser.subscribe(() => {
    setState(controller.getState()); setUrlError(browser.urlError());
    setManualUrl(""); setCopyStatus("");
    if (copyTimer) clearTimeout(copyTimer);
  });
  const keyboard = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (urlError() || target?.closest("input, textarea, select, [contenteditable=true]") || !(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) controller.redo(); else controller.undo(); }
    else if (event.key.toLowerCase() === "y") { event.preventDefault(); controller.redo(); }
  };
  document.addEventListener("keydown", keyboard);
  onCleanup(() => { unsubscribe(); browser.dispose(); document.removeEventListener("keydown", keyboard); if (copyTimer) clearTimeout(copyTimer); });
  const tournament = () => state().derived.tournament;
  const fixtures = () => state().derived.fixtures;
  const fixtureById = createMemo(() => new Map(fixtures().map((fixture) => [fixture.id, fixture])));
  const poolIds = createMemo(() => tournament().pools.map((pool) => pool.id));
  const poolFixtures = (pool: string) => fixtures().filter((fixture) => fixture.pool === pool);
  const complete = (fixture: ResolvedFixture) => Boolean(fixture.result && !fixture.issues.length);
  const poolCount = () => fixtures().filter((fixture) => fixture.stage === "pool" && complete(fixture)).length;
  const poolTotal = () => fixtures().filter((fixture) => fixture.stage === "pool").length;
  const knockoutCount = () => fixtures().filter((fixture) => fixture.stage !== "pool" && complete(fixture)).length;
  const copyLink = async () => {
    const url = window.location.href;
    let copied: boolean;
    try { await navigator.clipboard.writeText(url); copied = true; } catch {
      const previousFocus = document.activeElement as HTMLElement | null;
      const textarea = document.createElement("textarea");
      textarea.value = url; textarea.readOnly = true; textarea.tabIndex = -1;
      textarea.setAttribute("aria-hidden", "true");
      textarea.style.cssText = "position:fixed;left:0;top:0;opacity:0;pointer-events:none";
      document.body.append(textarea); textarea.focus({ preventScroll: true }); textarea.select();
      try { copied = document.execCommand("copy"); } catch { copied = false; }
      textarea.remove(); previousFocus?.focus({ preventScroll: true });
    }
    if (url !== window.location.href) { setCopyStatus("Predictions changed. Copy the link again."); return; }
    setManualUrl(copied ? "" : url); setCopyStatus(copied ? "Link copied" : "Select the link below to copy it.");
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => setCopyStatus(""), 3500);
  };
  return <div class="app-shell">
    <header class="app-header"><div class="brand">
      <svg class="brand-ball" viewBox="0 0 36 44" fill="none" aria-hidden="true"><ellipse cx="18" cy="22" rx="12" ry="20" transform="rotate(24 18 22)" stroke="currentColor" stroke-width="2" /><path d="m15 14 7 15M13 17l6-3M15 21l6-3M17 25l6-3" stroke="currentColor" stroke-width="2" /></svg>
      <span>Rugby World Cup<span class="brand-subtitle">Your tournament. Your call.</span></span><span class="brand-year">{tournament().id === "rwc2027" ? "2027" : "2023"}</span>
    </div><div class="toolbar" role="group" aria-label="Prediction actions">
      <button type="button" disabled={Boolean(urlError()) || !state().canUndo} onClick={() => controller.undo()} aria-label="Undo last prediction action" title="Undo (Ctrl/⌘ Z)"><svg class="action-icon" width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m7 4-4 4 4 4M3 8h8a5 5 0 0 1 0 10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg> <span>Undo</span></button>
      <button type="button" disabled={Boolean(urlError()) || !state().canRedo} onClick={() => controller.redo()} aria-label="Redo prediction action" title="Redo (Ctrl/⌘ Shift Z)"><svg class="action-icon" width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m13 4 4 4-4 4M17 8H9a5 5 0 0 0 0 10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg> <span>Redo</span></button>
      <button type="button" disabled={Boolean(urlError()) || !Object.keys(state().scenario.predictions).length} onClick={() => controller.reset()}>Reset</button>
      <button type="button" class="primary-button" disabled={Boolean(urlError())} onClick={() => void copyLink()}>Copy link <span aria-hidden="true">↗</span></button>
    </div></header>
    <div class="share-status" role="status">{copyStatus()}</div>
    <Show when={manualUrl()}><label class="manual-share">Your shareable link<input type="text" readonly value={manualUrl()} onFocus={(event) => event.currentTarget.select()} /></label></Show>
    <Show when={urlError()}><aside class="recovery-banner" role="alert"><div><strong>This prediction link could not be opened.</strong><p>{urlError()}</p></div><button type="button" onClick={() => browser.recover()}>Start fresh</button></aside></Show>
    <Show when={state().notice}><p class="scenario-notice" role="status">{state().notice}</p></Show>
    <main>
      <section class="intro"><div><p class="eyebrow">{tournament().id === "rwc2023" ? "Legacy 2023 tournament" : "Australia · 1 October – 13 November 2027"}</p><h1>How will your World Cup unfold?</h1><p>Pick the winners. Fine-tune the details if you like.</p><Show when={tournament().rulesStatus === "provisional"}><span class="rules-status">Provisional 2027 qualification rules</span></Show></div><div class="progress-summary"><strong>{poolCount()}<span> / {poolTotal()}</span></strong><span>pool matches picked</span></div></section>
      <nav class="view-nav" aria-label="Tournament views"><button type="button" aria-pressed={view() === "pools"} onClick={() => setView("pools")}>Pools <span>{tournament().pools.length}</span></button><button type="button" aria-pressed={view() === "knockout"} onClick={() => setView("knockout")}>Knockout <span>{knockoutCount()} / {fixtures().length - poolTotal()}</span></button></nav>
      <fieldset class="prediction-workspace" disabled={Boolean(urlError())}>
        <legend class="sr-only">Tournament predictions</legend>
        <Show when={view() === "pools"} fallback={<section class="knockout-view"><div class="view-intro"><h2>The road to the final</h2><p>Qualifying teams appear as you complete the pools. Pick who advances at each stage.</p></div><For each={stages.filter((stage) => fixtures().some((fixture) => fixture.stage === stage))}>{(stage) => <section class={`knockout-stage stage-${stage}`}><h3>{stageNames[stage]}</h3><div class="fixture-grid"><For each={fixtures().filter((fixture) => fixture.stage === stage).map((fixture) => fixture.id)}>{(id) => <FixtureCard fixture={fixtureById().get(id)!} controller={controller} />}</For></div></section>}</For></section>}>
          <nav class="pool-jumps" aria-label="Jump to a pool"><For each={poolIds()}>{(id) => <button type="button" onClick={() => document.getElementById(`pool-${id}`)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" })}>Pool {id}</button>}</For><span>Kickoff times are local to you.</span></nav>
          <For each={poolIds()}>{(pool) => <section class="pool-section" data-pool-id={pool} id={`pool-${pool}`}>
            <div class="pool-heading"><h2>Pool {pool}</h2><span>{poolFixtures(pool).filter(complete).length} / {poolFixtures(pool).length} picked</span></div>
            <div class="pool-content"><aside class="pool-table"><StandingsTable pool={pool} standings={state().derived.standings[pool] ?? []} teams={tournament().teams} complete={state().derived.poolsComplete} thirdQualified={state().derived.qualifiedThirdPools.includes(pool)} /><p class="qualification-note">{tournament().id === "rwc2027" ? "Top two advance. The four best third-place teams join them." : "The top two teams advance."}</p></aside>
              <div class="fixture-grid"><For each={poolFixtures(pool).map((fixture) => fixture.id)}>{(id) => <FixtureCard fixture={fixtureById().get(id)!} controller={controller} />}</For></div></div>
          </section>}</For>
        </Show>
      </fieldset>
    </main>
    <footer class="app-footer"><p>Everything happens in your browser. Share your predictions with the link.</p><details class="rules-details"><summary>{tournament().rulesStatus === "provisional" ? "Provisional 2027 rules & suggested outcomes" : "Tournament rules & sources"}</summary><p>{tournament().rulesNote}</p><p>Unspecified scores and tries use reproducible defaults. These are suggestions, rather than live odds or a calibrated forecast.</p><ul><For each={tournament().sources}>{(source) => <li><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label} ↗</a></li>}</For></ul><p>{tournament().rankingsLabel}</p></details></footer>
  </div>;
}

export default App;
