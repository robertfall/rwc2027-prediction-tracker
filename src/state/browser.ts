import { createScenarioController, emptyScenario, type ScenarioController } from "./controller";
import { decodeScenario, encodeScenario, PredictionLinkError } from "./codec";
import type { Scenario } from "../domain/types";

export interface BrowserLocation { pathname: string; search: string; hash: string }
export interface BrowserAdapter {
  readLocation: () => BrowserLocation;
  replaceUrl: (url: string) => void;
  listen: (callback: () => void) => () => void;
}
export interface BrowserController {
  controller: ScenarioController;
  urlError: () => string | undefined;
  matchId: () => number | undefined;
  setMatch: (id?: number) => void;
  clearFocusDestination: () => void;
  rememberShortLink: (token: string, alias: string) => boolean;
  recover: () => void;
  subscribe: (listener: () => void) => () => void;
  dispose: () => void;
}
export interface BrowserSharing {
  findAlias: (scenario: Scenario, signal: AbortSignal) => Promise<string | undefined>;
  delayMs?: number;
}

const nativeBrowser: BrowserAdapter = {
  readLocation: () => ({ pathname: window.location.pathname, search: window.location.search, hash: window.location.hash }),
  replaceUrl: (url) => window.history.replaceState(null, "", url),
  listen: (callback) => {
    window.addEventListener("popstate", callback);
    window.addEventListener("hashchange", callback);
    return () => { window.removeEventListener("popstate", callback); window.removeEventListener("hashchange", callback); };
  },
};

/** The sole URL writer. Scenario navigation starts a new undo session; match focus does not. */
export function createBrowserController(adapter: BrowserAdapter = nativeBrowser, basePath = import.meta.env.BASE_URL, sharing?: BrowserSharing): BrowserController {
  let error: string | undefined;
  let importing = false;
  let disposed = false;
  let lastLocation = "";
  let appPath = basePath;
  let lookupTimer: ReturnType<typeof setTimeout> | undefined;
  let lookupAbort: AbortController | undefined;
  const aliases = new Map<string, string>();
  const tokens = new Map<string, string>();
  const listeners = new Set<() => void>();
  const key = (location: BrowserLocation) => `${location.pathname}${location.search}${location.hash}`;
  const validAlias = (alias: string) => alias.length < 64 && /^[a-z]+(?:\.[a-z]+){2}$/.exec(alias)?.[0] === alias;
  const notify = () => { for (const listener of listeners) listener(); };

  function matchId(): number | undefined {
    if (error) return undefined;
    const values = new URLSearchParams(adapter.readLocation().search).getAll("match");
    if (values.length !== 1 || /^[1-9][0-9]*$/.exec(values[0])?.[0] !== values[0]) return undefined;
    const id = Number(values[0]);
    return controller.getState().derived.fixtures.some((fixture) => fixture.id === id) ? id : undefined;
  }

  function onlyDestinationChanged(before: string, after: string): boolean {
    // Prefix the fixed origin so a double-slash path stays a path, not an authority.
    const previous = new URL(`https://prediction.invalid${before}`);
    const next = new URL(`https://prediction.invalid${after}`);
    previous.searchParams.delete("match");
    next.searchParams.delete("match");
    previous.searchParams.delete("focus");
    next.searchParams.delete("focus");
    return previous.href === next.href;
  }

  function read(): Scenario {
    const location = adapter.readLocation();
    lastLocation = key(location);
    appPath = location.pathname === `${basePath}index.html` ? location.pathname : basePath;
    const shortPath = location.pathname.startsWith("/s/") && location.pathname !== basePath && location.pathname !== `${basePath}index.html`;
    try {
      let scenario: Scenario;
      if (shortPath && location.hash) {
        throw new PredictionLinkError("A short prediction link cannot also contain prediction details. Open the short link again or start fresh.");
      }
      if (location.hash) {
        if (!location.hash.startsWith("#predictions=")) throw new PredictionLinkError("The prediction link is malformed.");
        scenario = decodeScenario(location.hash.slice("#predictions=".length));
      } else if (location.pathname !== basePath && location.pathname !== `${basePath}index.html`) {
        if (shortPath) {
          const token = tokens.get(location.pathname.slice("/s/".length));
          if (!token) throw new PredictionLinkError("Open this short prediction link again to retrieve its saved choices.");
          scenario = decodeScenario(token);
        } else {
          if (!location.pathname.startsWith(basePath)) throw new PredictionLinkError("The prediction link is malformed.");
          // A legacy payload can contain several literal slash characters.
          scenario = decodeScenario(decodeURIComponent(location.pathname.slice(basePath.length)));
        }
      } else scenario = emptyScenario();
      error = undefined;
      return scenario;
    } catch (cause) {
      error = cause instanceof PredictionLinkError ? cause.message : "The prediction link is malformed.";
      return emptyScenario();
    }
  }

  const controller = createScenarioController(read());
  let currentToken = encodeScenario(controller.getState().scenario);

  function cancelLookup(): void {
    if (lookupTimer) clearTimeout(lookupTimer);
    lookupTimer = undefined;
    lookupAbort?.abort();
    lookupAbort = undefined;
  }

  function rememberShortLink(token: string, alias: string): boolean {
    if (disposed || !validAlias(alias) || (tokens.has(alias) && tokens.get(alias) !== token)) return false;
    try { if (encodeScenario(decodeScenario(token)) !== token) return false; } catch { return false; }
    aliases.set(token, alias);
    tokens.set(alias, token);
    if (error || token !== currentToken || key(adapter.readLocation()) !== lastLocation) return false;
    cancelLookup();
    const url = `/s/${alias}${adapter.readLocation().search}`;
    if (url !== lastLocation) adapter.replaceUrl(url);
    lastLocation = key(adapter.readLocation());
    return true;
  }

  function scheduleLookup(): void {
    cancelLookup();
    const scenario = controller.getState().scenario;
    if (!sharing || disposed || error || aliases.has(currentToken) ||
      (scenario.tournamentId === "rwc2027" && !Object.keys(scenario.predictions).length)) return;
    const token = currentToken;
    const location = lastLocation;
    const abort = new AbortController();
    lookupAbort = abort;
    lookupTimer = setTimeout(() => {
      lookupTimer = undefined;
      void Promise.resolve().then(() => sharing.findAlias(scenario, abort.signal)).then((alias) => {
        if (!abort.signal.aborted && !disposed && token === currentToken && location === lastLocation &&
          key(adapter.readLocation()) === location && alias) rememberShortLink(token, alias);
      }).catch(() => undefined);
    }, sharing.delayMs ?? 350);
  }

  const unsubscribe = controller.subscribe(() => {
    currentToken = encodeScenario(controller.getState().scenario);
    if (!importing && !error) {
      const scenario = controller.getState().scenario;
      const location = adapter.readLocation();
      const alias = aliases.get(currentToken);
      const hash = Object.keys(scenario.predictions).length || scenario.tournamentId !== "rwc2027" ? `#predictions=${currentToken}` : "";
      adapter.replaceUrl(alias ? `/s/${alias}${location.search}` : `${appPath}${location.search}${hash}`);
      lastLocation = key(adapter.readLocation());
    }
    scheduleLookup();
    notify();
  });
  scheduleLookup();
  const stopNavigation = adapter.listen(() => {
    if (key(adapter.readLocation()) === lastLocation) return;
    const previous = lastLocation;
    const previousError = error;
    const scenario = read();
    if (!previousError && !error && onlyDestinationChanged(previous, lastLocation) && encodeScenario(scenario) === currentToken) {
      controller.finishGroup();
      scheduleLookup();
      notify();
      return;
    }
    importing = true;
    try { controller.importScenario(scenario); } finally { importing = false; }
  });

  return {
    controller,
    urlError: () => error,
    matchId,
    setMatch: (id) => {
      if (disposed || error) return;
      if (id !== undefined && !controller.getState().derived.fixtures.some((fixture) => fixture.id === id)) {
        throw new RangeError("This match is outside the selected tournament.");
      }
      const location = adapter.readLocation();
      const search = new URLSearchParams(location.search);
      if (id === undefined) search.delete("match");
      else search.set("match", String(id));
      const query = search.toString();
      const path = location.pathname.startsWith("//") ? appPath : location.pathname;
      const url = `${path}${query ? `?${query}` : ""}${location.hash}`;
      if (url === key(location)) return;
      adapter.replaceUrl(url);
      lastLocation = key(adapter.readLocation());
      scheduleLookup();
      notify();
    },
    rememberShortLink,
    clearFocusDestination: () => {
      if (disposed || error) return;
      const location = adapter.readLocation();
      const search = new URLSearchParams(location.search);
      if (!search.has("focus")) return;
      search.delete("focus");
      const query = search.toString();
      const path = location.pathname.startsWith("//") ? appPath : location.pathname;
      adapter.replaceUrl(`${path}${query ? `?${query}` : ""}${location.hash}`);
      lastLocation = key(adapter.readLocation());
      scheduleLookup(); notify();
    },
    recover: () => {
      error = undefined;
      appPath = basePath;
      controller.importScenario(emptyScenario());
    },
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose: () => { disposed = true; cancelLookup(); unsubscribe(); stopNavigation(); listeners.clear(); },
  };
}
