import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserController, type BrowserAdapter } from "./browser";
import { encodeScenario } from "./codec";
import { createScenarioController } from "./controller";

function adapter(initial = "/") {
  let current = new URL(initial, "https://predict.example");
  const writes: string[] = [];
  const listeners = new Set<() => void>();
  const web: BrowserAdapter = {
    readLocation: () => ({ pathname: current.pathname, search: current.search, hash: current.hash }),
    replaceUrl: (url) => { writes.push(url); current = new URL(url, current); },
    listen: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  return {
    web, writes, url: () => `${current.pathname}${current.search}${current.hash}`,
    navigate: (url: string) => { current = new URL(url, current); for (const listener of listeners) listener(); },
    repeatEvent: () => { for (const listener of listeners) listener(); },
  };
}
function pick(id = 1, winner: "home" | "away" = "home") {
  const controller = createScenarioController();
  controller.update(id, { winner });
  return controller.getState().scenario;
}

afterEach(() => vi.unstubAllGlobals());

describe("Browser URL and history ownership", () => {
  it("hydrates without writing and uses replaceState-style updates for edits and undo", () => {
    const web = adapter("/?from=friend");
    const app = createBrowserController(web.web, "/");
    expect(web.writes).toEqual([]);
    app.controller.update(1, { homeScore: 2 }, "field");
    app.controller.update(1, { homeScore: 24 }, "field");
    expect(web.writes).toHaveLength(2);
    expect(web.url()).toContain("/?from=friend#predictions=v2.rwc2027");
    app.controller.undo();
    expect(web.url()).toBe("/?from=friend");
    app.controller.redo();
    const fresh = createBrowserController(adapter(web.url()).web, "/");
    expect(fresh.controller.getState().scenario).toEqual(app.controller.getState().scenario);
    expect(fresh.controller.getState().canUndo).toBe(false);
  });

  it("keeps the 2023 identity when reset empties a legacy scenario", () => {
    const web = adapter("/CAEJChI=");
    const app = createBrowserController(web.web, "/");
    app.controller.reset();
    expect(app.controller.getState().scenario.predictions).toEqual({});
    expect(web.url()).toContain("#predictions=v2.rwc2023.fixtures-v1.");
    const fresh = createBrowserController(adapter(web.url()).web, "/");
    expect(fresh.controller.getState().scenario.tournamentId).toBe("rwc2023");
    expect(fresh.controller.getState().scenario.predictions).toEqual({});
    app.controller.undo();
    expect(app.controller.getState().scenario.predictions[1].intent.homeScore).toBe(9);
  });

  it("imports browser navigation without feedback and resets the local undo session", () => {
    const web = adapter();
    const app = createBrowserController(web.web, "/");
    app.controller.update(1, { winner: "home" });
    const written = web.writes.length;
    web.navigate(`/#predictions=${encodeScenario(pick(2, "away"))}`);
    expect(app.controller.getState().scenario.predictions[2].intent.winner).toBe("away");
    expect(app.controller.getState().scenario.predictions[1]).toBeUndefined();
    expect(app.controller.getState().canUndo).toBe(false);
    expect(web.writes).toHaveLength(written);
    const before = app.controller.getState();
    web.repeatEvent();
    expect(app.controller.getState()).toBe(before);
    web.navigate("/");
    expect(app.controller.getState().scenario.predictions).toEqual({});
    expect(web.writes).toHaveLength(written);
  });

  it("keeps ordinary Base64 slash paths and legacy v1 fragments until the first edit", () => {
    for (const url of ["/AQH///8=", "/#predictions=v1.rwc2023.fixtures-v1.AQEfCQoBAg"]) {
      const web = adapter(url);
      const app = createBrowserController(web.web, "/");
      expect(app.urlError()).toBeUndefined();
      expect(web.writes).toEqual([]);
      expect(app.controller.getState().scenario.tournamentId).toBe("rwc2023");
      app.controller.update(2, { winner: "home" });
      expect(web.url()).toContain("/#predictions=v2.rwc2023.fixtures-v1.");
    }
  });

  it.each(["/broken", "/%E0%A4%A", "/#predictions=invalid", "/#other", "/#predictions=v3.rwc2027.anything.AAAA"])("preserves invalid addresses until explicit recovery (%s)", (url) => {
    const web = adapter(url);
    const app = createBrowserController(web.web, "/");
    expect(app.urlError()).toBeTruthy();
    app.controller.update(1, { winner: "home" });
    expect(web.writes).toEqual([]);
    expect(web.url()).toBe(url);
    app.recover();
    expect(app.urlError()).toBeUndefined();
    expect(web.url()).toBe("/");
    expect(app.controller.getState().scenario.predictions).toEqual({});
    expect(app.controller.getState().canUndo).toBe(false);
  });

  it("recovers valid navigation from an invalid address and notifies subscribers", () => {
    const web = adapter("/#predictions=broken");
    const app = createBrowserController(web.web, "/");
    const listener = vi.fn();
    app.subscribe(listener);
    web.navigate(`/#predictions=${encodeScenario(pick())}`);
    expect(app.urlError()).toBeUndefined();
    expect(listener).toHaveBeenCalledOnce();
    expect(web.writes).toEqual([]);
  });

  it("preserves configured static-host subpaths, queries, and index.html", () => {
    const web = adapter("/tracker/?from=friend");
    const app = createBrowserController(web.web, "/tracker/");
    app.controller.update(1, { winner: "home" });
    expect(web.url()).toContain("/tracker/?from=friend#predictions=v2.");
    web.navigate("/tracker/#predictions=broken");
    app.recover();
    expect(web.url()).toBe("/tracker/");
    const index = adapter("/tracker/index.html?from=friend");
    createBrowserController(index.web, "/tracker/").controller.update(1, { winner: "home" });
    expect(index.url()).toContain("/tracker/index.html?from=friend#predictions=");
  });

  it("wires native popstate/hashchange and replaceState without introducing pushState", () => {
    let location = new URL("https://predict.example/?from=friend");
    const events = new Map<string, Set<() => void>>();
    const replaceState = vi.fn((_state: unknown, _title: string, url: string) => { location = new URL(url, location); });
    const pushState = vi.fn();
    vi.stubGlobal("window", {
      get location() { return location; },
      history: { replaceState, pushState },
      addEventListener: (event: string, listener: () => void) => { if (!events.has(event)) events.set(event, new Set()); events.get(event)!.add(listener); },
      removeEventListener: (event: string, listener: () => void) => events.get(event)?.delete(listener),
    });
    const app = createBrowserController();
    app.controller.update(1, { winner: "home" });
    expect(replaceState).toHaveBeenCalledOnce();
    expect(pushState).not.toHaveBeenCalled();
    location = new URL(`https://predict.example/#predictions=${encodeScenario(pick(2, "away"))}`);
    for (const listener of events.get("popstate")!) listener();
    expect(app.controller.getState().scenario.predictions[2].intent.winner).toBe("away");
    location = new URL("https://predict.example/#predictions=broken");
    for (const listener of events.get("hashchange")!) listener();
    expect(app.urlError()).toBeTruthy();
    expect(replaceState).toHaveBeenCalledOnce();
    app.dispose();
    expect(events.get("popstate")?.size).toBe(0);
    expect(events.get("hashchange")?.size).toBe(0);
  });
});
