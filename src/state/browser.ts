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
  recover: () => void;
  subscribe: (listener: () => void) => () => void;
  dispose: () => void;
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
export function createBrowserController(adapter: BrowserAdapter = nativeBrowser, basePath = import.meta.env.BASE_URL): BrowserController {
  let error: string | undefined;
  let importing = false;
  let lastLocation = "";
  let appPath = basePath;
  const listeners = new Set<() => void>();
  const key = (location: BrowserLocation) => `${location.pathname}${location.search}${location.hash}`;

  function read(): Scenario {
    const location = adapter.readLocation();
    lastLocation = key(location);
    appPath = location.pathname === `${basePath}index.html` ? location.pathname : basePath;
    try {
      let scenario: Scenario;
      if (location.hash) {
        if (!location.hash.startsWith("#predictions=")) throw new PredictionLinkError("The prediction link is malformed.");
        scenario = decodeScenario(location.hash.slice("#predictions=".length));
      } else if (location.pathname !== basePath && location.pathname !== `${basePath}index.html`) {
        if (!location.pathname.startsWith(basePath)) throw new PredictionLinkError("The prediction link is malformed.");
        // A legacy payload can contain several literal slash characters.
        scenario = decodeScenario(decodeURIComponent(location.pathname.slice(basePath.length)));
      } else scenario = emptyScenario();
      error = undefined;
      return scenario;
    } catch (cause) {
      error = cause instanceof PredictionLinkError ? cause.message : "The prediction link is malformed.";
      return emptyScenario();
    }
  }

  const controller = createScenarioController(read());
  const unsubscribe = controller.subscribe(() => {
    if (!importing && !error) {
      const scenario = controller.getState().scenario;
      const location = adapter.readLocation();
      const hash = Object.keys(scenario.predictions).length || scenario.tournamentId !== "rwc2027" ? `#predictions=${encodeScenario(scenario)}` : "";
      adapter.replaceUrl(`${appPath}${location.search}${hash}`);
      lastLocation = key(adapter.readLocation());
    }
    for (const listener of listeners) listener();
  });
  const stopNavigation = adapter.listen(() => {
    if (key(adapter.readLocation()) === lastLocation) return;
    const scenario = read();
    importing = true;
    try { controller.importScenario(scenario); } finally { importing = false; }
  });

  return {
    controller,
    urlError: () => error,
    recover: () => {
      error = undefined;
      appPath = basePath;
      controller.importScenario(emptyScenario());
    },
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose: () => { unsubscribe(); stopNavigation(); listeners.clear(); },
  };
}
