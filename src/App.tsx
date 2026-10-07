import { For, Show, createMemo, createSignal, onCleanup, untrack } from "solid-js";
import { createBrowserController } from "./state/browser";
import { focusedTeamFromSearch, readFocusedTeam, rememberFocusedTeam } from "./state/focus-preference";
import { readTimeZone, rememberTimeZone, systemTimeZone } from "./state/timezone-preference";
import { rankingSnapshot } from "./domain/rankings";
import { planRankingFill } from "./domain/ranking-fill";
import { deriveTeamFocus } from "./domain/focus";
import { TeamFocusPicker } from "./components/TeamFocusPicker";
import { ShareMenu } from "./components/ShareMenu";
import { SettingsMenu } from "./components/SettingsMenu";
import { HelpDialog } from "./components/HelpDialog";
import { PoolInfographicDialog } from "./components/PoolInfographicDialog";
import { TimeZoneContext } from "./components/timezone-context";
import type { DerivedScenario, Scenario } from "./domain/types";
import { captureShareSnapshot, createShareClient } from "./sharing/client";
import { createPosterClient } from "./sharing/poster-client";
import { beginClipboardWrite } from "./sharing/clipboard";
import { Icon } from "./components/Icon";
import { MatchDetailsDialog } from "./components/MatchDetailsDialog";
import { KnockoutBracket, KnockoutRounds, PoolsByPool, Timeline } from "./components/TournamentViews";
import "./App.css";

function App() {
  const shareClient = createShareClient();
  const posterClient = createPosterClient();
  const browser = createBrowserController(undefined, import.meta.env.BASE_URL, {
    findAlias: async (scenario, signal) => {
      const snapshot = captureShareSnapshot(scenario, window.location.href, import.meta.env.BASE_URL);
      const link = await shareClient.findExistingLink(snapshot, signal);
      return link ? new URL(link.url).pathname.slice("/s/".length) : undefined;
    },
  });
  const controller = browser.controller;
  const initialState = controller.getState();
  const initialMatch = initialState.derived.fixtures.find((fixture) => fixture.id === browser.matchId());
  const linkFocus = browser.urlError() ? undefined : focusedTeamFromSearch(window.location.search, initialState.derived.tournament.teams);
  const savedFocus = browser.urlError() ? undefined : linkFocus ?? readFocusedTeam(initialState.derived.tournament.teams);
  const initialFocus = savedFocus && initialMatch && !deriveTeamFocus(initialState.derived, savedFocus).fixtureIds.has(initialMatch.id) ? undefined : savedFocus;
  const [state, setState] = createSignal(initialState);
  const [urlError, setUrlError] = createSignal(browser.urlError());
  const [phase, setPhase] = createSignal<"pools" | "knockout">(initialMatch && initialMatch.stage !== "pool" && initialState.derived.poolsComplete ? "knockout" : "pools");
  const [poolView, setPoolView] = createSignal<"pool" | "timeline">("pool");
  const [knockoutView, setKnockoutView] = createSignal<"rounds" | "timeline" | "bracket">("rounds");
  const [poolFilter, setPoolFilter] = createSignal("all");
  const [focusedTeam, setFocusedTeam] = createSignal<string | undefined>(initialFocus);
  const [timeZone, setTimeZone] = createSignal(readTimeZone());
  const deviceTimeZone = systemTimeZone();
  const effectiveTimeZone = () => timeZone() ?? deviceTimeZone;
  const [activeFixtureId, setActiveFixtureId] = createSignal<number | undefined>(browser.urlError() ? undefined : initialMatch?.id);
  const [copyStatus, setCopyStatus] = createSignal("");
  const [manualUrl, setManualUrl] = createSignal("");
  const [sharing, setSharing] = createSignal(false);
  const [showHelp, setShowHelp] = createSignal(false);
  const [poolShare, setPoolShare] = createSignal<{ derived: DerivedScenario; scenario: Scenario; teamId: string; timeZone: string; returnFocus: HTMLElement }>();
  let disposed = false;
  let loadedLinkFocus = linkFocus;
  let detailTrigger: HTMLElement | undefined;
  let detailTriggerId: number | undefined;
  let helpTrigger!: HTMLButtonElement;
  let loadedTournament = initialState.scenario.tournamentId;
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  const closeDetails = () => { controller.finishGroup(); browser.setMatch(); };
  const openDetails = (id: number, trigger: HTMLButtonElement) => {
    if (urlError()) return;
    controller.finishGroup(); detailTrigger = trigger; detailTriggerId = id; browser.setMatch(id);
  };
  const detailReturnTarget = (id: number): HTMLElement | undefined => {
    const visible = (element: HTMLElement | undefined | null) => Boolean(element?.isConnected && element.getClientRects().length && !element.matches(":disabled"));
    if (detailTriggerId === id && visible(detailTrigger)) return detailTrigger;
    const trigger = document.querySelector<HTMLButtonElement>(`[data-fixture-id="${id}"] button[aria-haspopup="dialog"]:not(:disabled)`);
    if (visible(trigger)) return trigger!;
    return document.querySelector<HTMLButtonElement>(".view-nav button[aria-pressed=true]") ?? undefined;
  };
  const unsubscribe = browser.subscribe(() => untrack(() => {
    const next = controller.getState();
    const nextLinkFocus = browser.urlError() ? undefined : focusedTeamFromSearch(window.location.search, next.derived.tournament.teams);
    const changedTournament = next.scenario.tournamentId !== loadedTournament;
    const recovered = Boolean(urlError()) && !browser.urlError();
    const matchId = browser.urlError() ? undefined : browser.matchId();
    if (browser.urlError() || changedTournament || recovered) {
      // Route changes dismiss the old dialog without clearing the newly addressed match.
      setActiveFixtureId(undefined); setPoolFilter("all");
      setFocusedTeam(browser.urlError() ? undefined : nextLinkFocus ?? readFocusedTeam(next.derived.tournament.teams));
      detailTrigger = undefined; detailTriggerId = undefined;
    } else if (nextLinkFocus !== loadedLinkFocus) {
      setFocusedTeam(nextLinkFocus ?? readFocusedTeam(next.derived.tournament.teams)); setPoolFilter("all");
    }
    loadedLinkFocus = nextLinkFocus;
    if (activeFixtureId() !== matchId) controller.finishGroup();
    if (detailTriggerId !== matchId) { detailTrigger = undefined; detailTriggerId = undefined; }
    loadedTournament = next.scenario.tournamentId;
    setState(next); setUrlError(browser.urlError());
    const match = next.derived.fixtures.find((fixture) => fixture.id === matchId);
    // A newly addressed match must stay visible even if a previous team filter hid it.
    if (match && activeFixtureId() !== match.id && focusedTeam() &&
      !deriveTeamFocus(next.derived, focusedTeam()).fixtureIds.has(match.id)) setFocusedTeam(undefined);
    if (match) {
      setPhase(match.stage !== "pool" && next.derived.poolsComplete ? "knockout" : "pools");
      if (match.stage === "pool" && poolFilter() !== "all" && poolFilter() !== match.pool) setPoolFilter(match.pool ?? "all");
    }
    // A stable fixture ID keeps live editing mounted through prediction and alias changes.
    setActiveFixtureId(match?.id);
    setManualUrl(""); setCopyStatus("");
    if (copyTimer) clearTimeout(copyTimer);
  }));
  const keyboard = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (showHelp() || urlError() || target?.closest("input, textarea, select, [contenteditable=true]") || !(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) controller.redo(); else controller.undo(); }
    else if (event.key.toLowerCase() === "y") { event.preventDefault(); controller.redo(); }
  };
  document.addEventListener("keydown", keyboard);
  onCleanup(() => { disposed = true; unsubscribe(); browser.dispose(); document.removeEventListener("keydown", keyboard); if (copyTimer) clearTimeout(copyTimer); });
  const tournament = () => state().derived.tournament;
  const fixtures = () => state().derived.fixtures;
  const fixtureById = createMemo(() => new Map(fixtures().map((fixture) => [fixture.id, fixture])));
  const teamFocus = createMemo(() => deriveTeamFocus(state().derived, focusedTeam()));
  const visibleFixtureIds = () => focusedTeam() ? teamFocus().fixtureIds : undefined;
  const visiblePools = () => tournament().pools.filter((pool) => !focusedTeam() || teamFocus().poolIds.has(pool.id));
  const activePoolFilter = () => visiblePools().some((pool) => pool.id === poolFilter()) ? poolFilter() : "all";
  const poolFixtures = createMemo(() => fixtures().filter((fixture) => fixture.stage === "pool"));
  const poolCount = () => poolFixtures().filter((fixture) => fixture.result && !fixture.issues.length).length;
  const knockoutTotal = () => fixtures().length - poolFixtures().length;
  const knockoutCount = () => fixtures().filter((fixture) => fixture.stage !== "pool" && fixture.result && !fixture.issues.length).length;
  const knockoutLocked = () => !state().derived.poolsComplete;
  const canFill = () => fixtures().some((fixture) => !fixture.prediction && fixture.homeTeam && fixture.awayTeam);
  const rankingSource = () => rankingSnapshot(tournament().id);
  const activePhase = () => phase() === "knockout" && !knockoutLocked() ? "knockout" : "pools";
  const hasFocusedKnockout = () => !focusedTeam() || fixtures().some((fixture) => fixture.stage !== "pool" && teamFocus().fixtureIds.has(fixture.id));
  const knockoutHint = () => "Complete " + (poolFixtures().length - poolCount()) + " remaining pool " + (poolFixtures().length - poolCount() === 1 ? "match" : "matches") + " to unlock the knockout. Resolve any conflicting details first.";
  const copyLink = async (fullTournament = false) => {
    if (sharing() || urlError()) return;
    const source = new URL(window.location.href);
    if (fullTournament) source.searchParams.delete("match");
    const snapshot = captureShareSnapshot(controller.getState().scenario, source.href, import.meta.env.BASE_URL);
    setSharing(true); setManualUrl(""); setCopyStatus("");
    if (copyTimer) clearTimeout(copyTimer);
    const link = shareClient.getLink(snapshot);
    const nativeCopy = beginClipboardWrite(link, () => !disposed);
    try {
      const { url, shortUnavailable } = await link;
      if (disposed) return;
      const path = new URL(url).pathname;
      if (!shortUnavailable && path.startsWith("/s/")) browser.rememberShortLink(snapshot.token, path.slice("/s/".length));
      let copied = await nativeCopy;
      if (disposed) return;
      if (!copied) {
        try { await navigator.clipboard.writeText(url); copied = true; } catch {
          if (disposed) return;
          const previousFocus = document.activeElement as HTMLElement | null;
          const textarea = document.createElement("textarea");
          textarea.value = url; textarea.readOnly = true; textarea.tabIndex = -1;
          textarea.setAttribute("aria-hidden", "true");
          textarea.style.cssText = "position:fixed;left:0;top:0;opacity:0;pointer-events:none";
          try {
            document.body.append(textarea); textarea.focus({ preventScroll: true }); textarea.select();
            copied = document.execCommand("copy");
          } catch { copied = false; }
          finally { textarea.remove(); previousFocus?.focus({ preventScroll: true }); }
        }
      }
      if (disposed) return;
      setManualUrl(copied ? "" : url);
      setCopyStatus(copied ? (shortUnavailable ? "Copied full link; short link unavailable." : "Link copied") :
        (shortUnavailable ? "Short link unavailable. Select the full link below to copy it." : "Select the link below to copy it."));
      if (copyTimer) clearTimeout(copyTimer);
      copyTimer = setTimeout(() => setCopyStatus(""), 3500);
    } finally {
      if (!disposed) setSharing(false);
    }
  };
  return <TimeZoneContext.Provider value={effectiveTimeZone}><div class="app-shell">
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
          <ShareMenu team={tournament().teams.find((team) => team.id === focusedTeam())} disabled={Boolean(urlError()) || sharing()} sharing={sharing()}
            onCopy={() => void copyLink(true)} onPool={(returnFocus) => {
              const teamId = focusedTeam();
              if (teamId && !urlError()) {
                const captured = controller.getState();
                setPoolShare({ derived: captured.derived, scenario: captured.scenario, teamId, timeZone: effectiveTimeZone(), returnFocus });
              }
            }} />
          <SettingsMenu timeZone={timeZone()} onChange={(value) => { setTimeZone(value); rememberTimeZone(value); }} />
        </div>
        <button ref={(element) => { helpTrigger = element; }} type="button" class="help-button" aria-label="How does it work?" title="How does it work?"
          aria-haspopup="dialog" aria-expanded={showHelp()} onClick={() => setShowHelp(true)}><Icon name="help" size={20} /></button>
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
        <TeamFocusPicker teams={tournament().teams} value={focusedTeam()} disabled={Boolean(urlError())}
          onChange={(teamId) => { setFocusedTeam(teamId); rememberFocusedTeam(teamId); setPoolFilter("all"); browser.clearFocusDestination(); }} />
        <Show when={activePhase() === "pools" && visiblePools().length > 1}><div class="pool-filter"><span class="control-caption">Pool</span><div class="segmented" role="group" aria-label="Pool filter">
          <For each={["all", ...visiblePools().map((pool) => pool.id)]}>{(pool) => <button type="button" aria-pressed={activePoolFilter() === pool} onClick={() => setPoolFilter(pool)}>{pool === "all" ? "All" : pool}</button>}</For>
        </div></div></Show>
        <button type="button" class="fill-button" disabled={Boolean(urlError()) || !canFill()}
          aria-label="Fill unpicked matches" title={`Fill all unpicked matches using World Rugby rankings (${rankingSource().effectiveDate}). Keeps your existing picks; undo in one action.`}
          onClick={() => {
            const { updates, cleared, conflicts } = planRankingFill(state().scenario);
            const notice = `${updates.length} ${updates.length === 1 ? "match" : "matches"} filled from world rankings.` +
              (cleared ? ` ${cleared} dependent ${cleared === 1 ? "pick was" : "picks were"} replaced because the teams changed.` : "") +
              (conflicts ? ` ${conflicts} conflicting ${conflicts === 1 ? "match still needs" : "matches still need"} your attention.` : "");
            controller.applyBatch(updates, notice);
          }}>Fill matches</button>
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
          <Show when={hasFocusedKnockout()} fallback={<p class="focus-empty">{tournament().teams.find((team) => team.id === focusedTeam())?.name} has no knockout matches in this prediction.</p>}>
          <Show when={knockoutView() === "rounds"}><KnockoutRounds derived={state().derived} controller={controller} onDetails={openDetails} visibleFixtureIds={visibleFixtureIds()} /></Show>
          <Show when={knockoutView() === "timeline"}><Timeline phase="knockout" derived={state().derived} controller={controller} onDetails={openDetails} visibleFixtureIds={visibleFixtureIds()} /></Show>
          <Show when={knockoutView() === "bracket"}><KnockoutBracket derived={state().derived} controller={controller} onDetails={openDetails} visibleFixtureIds={visibleFixtureIds()} /></Show>
          </Show>
        </section>}>
          <Show when={poolView() === "pool"} fallback={<Timeline phase="pools" filter={activePoolFilter()} derived={state().derived} controller={controller} onDetails={openDetails} visibleFixtureIds={visibleFixtureIds()} />}>
            <PoolsByPool filter={activePoolFilter()} derived={state().derived} controller={controller} onDetails={openDetails} visibleFixtureIds={visibleFixtureIds()} />
          </Show>
        </Show>
      </fieldset>
      <footer class="app-footer">
        <p>Kickoff times are shown in {effectiveTimeZone()}. Prediction edits happen in your browser. Share your predictions with a link.</p>
        <details class="rules-details"><summary>{tournament().rulesStatus === "provisional" ? "Provisional 2027 rules & suggested outcomes" : "Tournament rules & sources"}</summary>
          <p>{tournament().rulesNote}</p><p>Unspecified scores and tries use reproducible defaults. Open match details to choose a margin, tries, exact scores or bonus points. These are suggestions, rather than live odds or a calibrated forecast.</p>
          <p>Fill matches uses <a href={rankingSource().source} target="_blank" rel="noopener noreferrer">{rankingSource().label}</a>. Rating-point gaps determine projected margins, scores and tries. Existing choices stay intact; conflicts can leave later matches waiting. You can undo the whole fill at once.</p>
          <ul><For each={tournament().sources}>{(source) => <li><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a></li>}</For></ul><p>{tournament().rankingsLabel}</p>
        </details>
        <p>An independent project. Not affiliated with or endorsed by World Rugby or Rugby World Cup Limited.</p>
      </footer>
    </main>
    <div classList={{ "share-status": true, "share-status--visible": Boolean(copyStatus()) }} role="status">{copyStatus()}</div>
    <Show when={showHelp()}><HelpDialog provisionalRules={tournament().rulesStatus === "provisional"} returnFocus={helpTrigger} onClose={() => setShowHelp(false)} /></Show>
    <Show when={poolShare()}>{(snapshot) => <PoolInfographicDialog derived={snapshot().derived} scenario={snapshot().scenario} teamId={snapshot().teamId} timeZone={snapshot().timeZone} posterClient={posterClient}
      returnFocus={snapshot().returnFocus} onClose={() => setPoolShare(undefined)} />}</Show>
    <Show when={activeFixtureId()} keyed>{(id) => <MatchDetailsDialog fixture={fixtureById().get(id)!} controller={controller} onClose={closeDetails}
      returnFocus={() => detailReturnTarget(id)} onCopyLink={copyLink} sharing={sharing()} copyDisabled={Boolean(urlError())}
      copyStatus={copyStatus()} manualUrl={manualUrl()} />}</Show>
  </div></TimeZoneContext.Provider>;
}

export default App;
