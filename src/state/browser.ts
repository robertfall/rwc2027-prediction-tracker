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

/** The sole URL writer. Browser navigation imports a scenario and starts a new undo session. */
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
    for (const listener of listeners) listener();
  });
  scheduleLookup();
  const stopNavigation = adapter.listen(() => {
    if (key(adapter.readLocation()) === lastLocation) return;
    const scenario = read();
    importing = true;
    try { controller.importScenario(scenario); } finally { importing = false; }
  });

  return {
    controller,
    urlError: () => error,
    rememberShortLink,
    recover: () => {
      error = undefined;
      appPath = basePath;
      controller.importScenario(emptyScenario());
    },
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose: () => { disposed = true; cancelLookup(); unsubscribe(); stopNavigation(); listeners.clear(); },
  };
}
