import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";
import { createBrowserController } from "./state/browser";
import { Icon } from "./components/Icon";
import { MatchDetailsDialog } from "./components/MatchDetailsDialog";
import { KnockoutBracket, KnockoutRounds, PoolsByPool, Timeline } from "./components/TournamentViews";
import "./App.css";

function App() {
  const browser = createBrowserController();
  const controller = browser.controller;
  const [state, setState] = createSignal(controller.getState());
  const [urlError, setUrlError] = createSignal(browser.urlError());
  const [phase, setPhase] = createSignal<"pools" | "knockout">("pools");
  const [poolView, setPoolView] = createSignal<"pool" | "timeline">("pool");
  const [knockoutView, setKnockoutView] = createSignal<"rounds" | "timeline" | "bracket">("rounds");
  const [poolFilter, setPoolFilter] = createSignal("all");
  const [activeFixtureId, setActiveFixtureId] = createSignal<number>();
  const [copyStatus, setCopyStatus] = createSignal("");
  const [manualUrl, setManualUrl] = createSignal("");
  let detailTrigger: HTMLElement | undefined;
  let loadedTournament = controller.getState().scenario.tournamentId;
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  const closeDetails = () => { controller.finishGroup(); setActiveFixtureId(undefined); };
  const openDetails = (id: number, trigger: HTMLButtonElement) => {
    if (urlError()) return;
    controller.finishGroup(); detailTrigger = trigger; setActiveFixtureId(id);
  };
  const unsubscribe = browser.subscribe(() => {
    const next = controller.getState();
    if (browser.urlError() || next.scenario.tournamentId !== loadedTournament) {
      closeDetails(); setPoolFilter("all");
    }
    loadedTournament = next.scenario.tournamentId;
    setState(next); setUrlError(browser.urlError());
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
  const poolFixtures = createMemo(() => fixtures().filter((fixture) => fixture.stage === "pool"));
  const poolCount = () => poolFixtures().filter((fixture) => fixture.result && !fixture.issues.length).length;
  const knockoutTotal = () => fixtures().length - poolFixtures().length;
  const knockoutCount = () => fixtures().filter((fixture) => fixture.stage !== "pool" && fixture.result && !fixture.issues.length).length;
  const knockoutLocked = () => !state().derived.poolsComplete;
  const activePhase = () => phase() === "knockout" && !knockoutLocked() ? "knockout" : "pools";
  const knockoutHint = () => "Complete " + (poolFixtures().length - poolCount()) + " remaining pool " + (poolFixtures().length - poolCount() === 1 ? "match" : "matches") + " to unlock the knockout. Resolve any conflicting details first.";
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
    <header class="app-header">
      <div class="toolbar-main">
        <div class="wordmark" aria-label={"Rugby World Cup " + (tournament().id === "rwc2027" ? "2027" : "2023") + " predictor"}>
          <span>RWC<span class="wordmark-slash"> / </span>predictor</span><span class="wordmark-year">{tournament().id === "rwc2027" ? "2027" : "2023"}</span>
        </div>
        <nav class="view-nav" aria-label="Tournament stages">
          <button type="button" aria-pressed={activePhase() === "pools"} onClick={() => setPhase("pools")}>
            <span aria-hidden="true" classList={{ "stage-number": true, "is-complete": !knockoutLocked() }}><Show when={!knockoutLocked()} fallback="1"><Icon name="check" size={12} /></Show></span>
            <span>Pools</span><span class="stage-count">{poolCount()}/{poolFixtures().length}</span>
          </button>
          <Icon name="chevron-right" class="stage-chevron" />
          <div class="stage-knockout">
            <button type="button" aria-pressed={activePhase() === "knockout"} aria-disabled={knockoutLocked()}
              aria-describedby={knockoutLocked() ? "knockout-lock-hint" : undefined}
              onClick={() => { if (!knockoutLocked()) setPhase("knockout"); }}>
              <Show when={knockoutLocked()} fallback={<span aria-hidden="true" classList={{ "stage-number": true, "is-complete": knockoutCount() === knockoutTotal() }}><Show when={knockoutCount() === knockoutTotal()} fallback="2"><Icon name="check" size={12} /></Show></span>}><Icon name="lock" /></Show>
              <span>Knockout</span><Show when={!knockoutLocked()}><span class="stage-count">{knockoutCount()}/{knockoutTotal()}</span></Show>
            </button>
            <Show when={knockoutLocked()}><span id="knockout-lock-hint" class="stage-tooltip" role="tooltip">{knockoutHint()}</span></Show>
          </div>
        </nav>
        <div class="toolbar-actions" role="group" aria-label="Prediction actions">
          <div class="history-actions">
            <button type="button" class="icon-button" disabled={Boolean(urlError()) || !state().canUndo} onClick={() => controller.undo()} aria-label="Undo last prediction action" title="Undo (Ctrl/⌘ Z)"><Icon name="undo" /></button>
            <button type="button" class="icon-button" disabled={Boolean(urlError()) || !state().canRedo} onClick={() => controller.redo()} aria-label="Redo prediction action" title="Redo (Ctrl/⌘ Shift Z)"><Icon name="redo" /></button>
            <button type="button" class="icon-button" disabled={Boolean(urlError()) || !Object.keys(state().scenario.predictions).length} onClick={() => controller.reset()} aria-label="Reset all picks" title="Reset all picks"><Icon name="reset" /></button>
          </div>
          <button type="button" class="copy-button" disabled={Boolean(urlError())} onClick={() => void copyLink()} aria-label="Copy link"><Icon name="link" /><span>Copy link</span></button>
        </div>
      </div>
      <div class="toolbar-views"><div class="toolbar-views-inner">
        <div class="segmented view-options" role="group" aria-label="View">
          <Show when={activePhase() === "pools"} fallback={<>
            <button type="button" aria-pressed={knockoutView() === "rounds"} onClick={() => setKnockoutView("rounds")}><Icon name="grid" />Rounds</button>
            <button type="button" aria-pressed={knockoutView() === "timeline"} onClick={() => setKnockoutView("timeline")}><Icon name="calendar" />Timeline</button>
            <button type="button" aria-pressed={knockoutView() === "bracket"} onClick={() => setKnockoutView("bracket")}><Icon name="bracket" />Bracket</button>
          </>}>
            <button type="button" aria-pressed={poolView() === "pool"} onClick={() => setPoolView("pool")}><Icon name="grid" />By pool</button>
            <button type="button" aria-pressed={poolView() === "timeline"} onClick={() => setPoolView("timeline")}><Icon name="calendar" />Timeline</button>
          </Show>
        </div>
        <Show when={activePhase() === "pools"}><div class="pool-filter"><span class="control-caption">Pool</span><div class="segmented" role="group" aria-label="Pool filter">
          <For each={["all", ...tournament().pools.map((pool) => pool.id)]}>{(pool) => <button type="button" aria-pressed={poolFilter() === pool} onClick={() => setPoolFilter(pool)}>{pool === "all" ? "All" : pool}</button>}</For>
        </div></div></Show>
      </div></div>
    </header>
    <main class="app-main">
      <h1 class="sr-only">{tournament().name} predictor</h1>
      <Show when={tournament().id === "rwc2023"}><p class="eyebrow legacy-notice">Legacy 2023 tournament</p></Show>
      <Show when={manualUrl()}><label class="manual-share">Your shareable link<input type="text" readonly value={manualUrl()} onFocus={(event) => event.currentTarget.select()} /></label></Show>
      <Show when={urlError()}><aside class="recovery-banner" role="alert"><div><strong>This prediction link could not be opened.</strong><p>{urlError()}</p></div><button type="button" onClick={() => browser.recover()}>Start fresh</button></aside></Show>
      <Show when={state().notice}><p class="scenario-notice" role="status">{state().notice}</p></Show>
      <fieldset class="prediction-workspace" disabled={Boolean(urlError())}>
        <legend class="sr-only">Tournament predictions</legend>
        <Show when={activePhase() === "pools"} fallback={<section class="knockout-view" aria-label="Knockout predictions">
          <Show when={knockoutView() === "rounds"}><KnockoutRounds derived={state().derived} controller={controller} onDetails={openDetails} /></Show>
          <Show when={knockoutView() === "timeline"}><Timeline phase="knockout" derived={state().derived} controller={controller} onDetails={openDetails} /></Show>
          <Show when={knockoutView() === "bracket"}><KnockoutBracket derived={state().derived} controller={controller} onDetails={openDetails} /></Show>
        </section>}>
          <Show when={poolView() === "pool"} fallback={<Timeline phase="pools" filter={poolFilter()} derived={state().derived} controller={controller} onDetails={openDetails} />}>
            <PoolsByPool filter={poolFilter()} derived={state().derived} controller={controller} onDetails={openDetails} />
          </Show>
        </Show>
      </fieldset>
      <footer class="app-footer">
        <p>Kickoff times are local to you. Everything happens in your browser. Share your predictions with the link.</p>
        <details class="rules-details"><summary>{tournament().rulesStatus === "provisional" ? "Provisional 2027 rules & suggested outcomes" : "Tournament rules & sources"}</summary>
          <p>{tournament().rulesNote}</p><p>Unspecified scores and tries use reproducible defaults. Open match details to choose a margin, tries, exact scores or bonus points. These are suggestions, rather than live odds or a calibrated forecast.</p>
          <ul><For each={tournament().sources}>{(source) => <li><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a></li>}</For></ul><p>{tournament().rankingsLabel}</p>
        </details>
        <p>An independent project. Not affiliated with or endorsed by World Rugby or Rugby World Cup Limited.</p>
      </footer>
    </main>
    <div classList={{ "share-status": true, "share-status--visible": Boolean(copyStatus()) }} role="status">{copyStatus()}</div>
    <Show when={activeFixtureId()} keyed>{(id) => <MatchDetailsDialog fixture={fixtureById().get(id)!} controller={controller} onClose={closeDetails} returnFocus={detailTrigger} />}</Show>
  </div>;
}

export default App;
