import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserController, type BrowserAdapter, type BrowserSharing } from "./browser";
import { encodeScenario } from "./codec";
import { createScenarioController } from "./controller";
import { planRankingFill } from "../domain/ranking-fill";

const originalV2 = "v2.rwc2027.fixtures-2026-02.AE4ARItWKijKL8sszszPS8zRLTNU0lFKSU1LLM0pKQbzoqMNdQx1opUy8nNTlWJ18kpzcnSijUx0DM11jHWMdCDiYOFYIAAA";

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

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Browser URL and history ownership", () => {
  it("replaces the current address with its alias without publishing state or changing undo", () => {
    const web = adapter("/?from=friend");
    const app = createBrowserController(web.web, "/");
    app.controller.update(1, { winner: "home" });
    const before = app.controller.getState();
    const listener = vi.fn();
    app.subscribe(listener);
    const token = encodeScenario(before.scenario);
    expect(app.rememberShortLink(token, "maple.river.sunny")).toBe(true);
    expect(web.url()).toBe("/s/maple.river.sunny?from=friend");
    expect(app.controller.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    web.repeatEvent();
    expect(app.controller.getState()).toBe(before);
    app.controller.update(2, { winner: "away" });
    const changed = web.url();
    expect(changed).toContain("/?from=friend#predictions=v3.");
    app.controller.undo();
    expect(web.url()).toBe("/s/maple.river.sunny?from=friend");
    app.controller.undo();
    expect(web.url()).toBe("/?from=friend");
    app.controller.redo();
    expect(web.url()).toBe("/s/maple.river.sunny?from=friend");
    app.controller.redo();
    expect(web.url()).toBe(changed);
    app.dispose();
  });

  it("keeps a late shared alias for undo without replacing a newer prediction", () => {
    const web = adapter();
    const app = createBrowserController(web.web, "/");
    app.controller.update(1, { winner: "home" });
    const token = encodeScenario(app.controller.getState().scenario);
    app.controller.update(1, { winner: "away" });
    const changed = web.url();
    expect(app.rememberShortLink(token, "maple.river.sunny")).toBe(false);
    expect(web.url()).toBe(changed);
    app.controller.undo();
    expect(web.url()).toBe("/s/maple.river.sunny");
    app.dispose();
  });

  it("checks an initial state and debounces edits, then restores known aliases synchronously", async () => {
    vi.useFakeTimers();
    const initial = pick();
    const web = adapter(`/#predictions=${encodeScenario(initial)}`);
    const findAlias = vi.fn<BrowserSharing["findAlias"]>(async () => "maple.river.sunny");
    const app = createBrowserController(web.web, "/", { findAlias });
    const before = app.controller.getState();
    expect(findAlias).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(350);
    expect(findAlias).toHaveBeenCalledOnce();
    expect(findAlias.mock.calls[0][0]).toEqual(initial);
    expect(web.url()).toBe("/s/maple.river.sunny");
    expect(app.controller.getState()).toBe(before);
    findAlias.mockResolvedValue(undefined);
    app.controller.update(2, { homeScore: 2 }, "field");
    await vi.advanceTimersByTimeAsync(300);
    app.controller.update(2, { homeScore: 24 }, "field");
    await vi.advanceTimersByTimeAsync(349);
    expect(findAlias).toHaveBeenCalledOnce();
    expect(web.url()).toContain("#predictions=v3.");
    await vi.advanceTimersByTimeAsync(1);
    expect(findAlias).toHaveBeenCalledTimes(2);
    app.controller.undo();
    expect(web.url()).toBe("/s/maple.river.sunny");
    await vi.advanceTimersByTimeAsync(1000);
    expect(findAlias).toHaveBeenCalledTimes(2);
    app.dispose();
  });

  it("aborts superseded lookups and ignores responses after edits, navigation and disposal", async () => {
    vi.useFakeTimers();
    const pending: { signal: AbortSignal; resolve: (alias: string) => void }[] = [];
    const findAlias = vi.fn<BrowserSharing["findAlias"]>((...args) => new Promise<string>((resolve) => pending.push({ signal: args[1], resolve })));
    const web = adapter(`/#predictions=${encodeScenario(pick())}`);
    const app = createBrowserController(web.web, "/", { findAlias });
    await vi.advanceTimersByTimeAsync(350);
    app.controller.update(2, { winner: "home" });
    const edited = web.url();
    expect(pending[0].signal.aborted).toBe(true);
    pending[0].resolve("maple.river.sunny");
    await vi.advanceTimersByTimeAsync(0);
    expect(web.url()).toBe(edited);
    await vi.advanceTimersByTimeAsync(350);
    web.navigate(`/?from=new#predictions=${encodeScenario(pick())}`);
    const navigated = web.url();
    expect(pending[1].signal.aborted).toBe(true);
    pending[1].resolve("blue.river.sunny");
    await vi.advanceTimersByTimeAsync(350);
    expect(web.url()).toBe(navigated);
    app.dispose();
    expect(pending[2].signal.aborted).toBe(true);
    pending[2].resolve("green.river.sunny");
    await vi.advanceTimersByTimeAsync(1000);
    expect(web.url()).toBe(navigated);
    expect(findAlias).toHaveBeenCalledTimes(3);
  });

  it("imports cached aliases on navigation without writes or feedback and resets undo", () => {
    const web = adapter();
    const app = createBrowserController(web.web, "/");
    app.controller.update(1, { winner: "home" });
    const first = app.controller.getState().scenario;
    app.rememberShortLink(encodeScenario(first), "maple.river.sunny");
    app.controller.update(2, { winner: "away" });
    app.rememberShortLink(encodeScenario(app.controller.getState().scenario), "blue.river.sunny");
    const writes = web.writes.length;
    web.navigate("/s/maple.river.sunny");
    expect(app.controller.getState().scenario).toEqual(first);
    expect(app.controller.getState().canUndo).toBe(false);
    expect(web.writes).toHaveLength(writes);
    const before = app.controller.getState();
    web.repeatEvent();
    expect(app.controller.getState()).toBe(before);
    app.dispose();
  });

  it("preserves a conflicting alias fragment until recovery instead of showing a state that reload would change", async () => {
    vi.useFakeTimers();
    const web = adapter();
    const findAlias = vi.fn<BrowserSharing["findAlias"]>(async () => undefined);
    const app = createBrowserController(web.web, "/", { findAlias });
    app.controller.update(1, { winner: "home" });
    app.rememberShortLink(encodeScenario(app.controller.getState().scenario), "maple.river.sunny");
    const invalid = `/s/maple.river.sunny#predictions=${encodeScenario(pick(1, "away"))}`;
    const writes = web.writes.length;
    web.navigate(invalid);
    expect(app.urlError()).toMatch(/short prediction link cannot also contain/);
    expect(web.url()).toBe(invalid);
    expect(web.writes).toHaveLength(writes);
    await vi.advanceTimersByTimeAsync(350);
    expect(findAlias).not.toHaveBeenCalled();
    app.recover();
    expect(app.urlError()).toBeUndefined();
    expect(web.url()).toBe("/");
    app.dispose();
  });

  it("keeps unknown or unavailable lookups silent and never checks malformed or empty states", async () => {
    vi.useFakeTimers();
    const findAlias = vi.fn(async (): Promise<string | undefined> => undefined);
    for (const url of ["/", "/#predictions=broken"]) {
      const web = adapter(url);
      const app = createBrowserController(web.web, "/", { findAlias });
      await vi.advanceTimersByTimeAsync(350);
      expect(web.url()).toBe(url);
      expect(web.writes).toEqual([]);
      app.dispose();
    }
    expect(findAlias).not.toHaveBeenCalled();
    const token = encodeScenario(pick());
    for (const failure of [async () => undefined, async () => { throw new Error("Offline"); }]) {
      const web = adapter(`/#predictions=${token}`);
      const app = createBrowserController(web.web, "/", { findAlias: failure });
      await vi.advanceTimersByTimeAsync(350);
      expect(web.writes).toEqual([]);
      expect(app.urlError()).toBeUndefined();
      expect(app.controller.getState().scenario).toEqual(pick());
      app.dispose();
    }
  });

  it("rejects unsafe aliases, invalid tokens and conflicting alias bindings", () => {
    const web = adapter();
    const app = createBrowserController(web.web, "/");
    app.controller.update(1, { winner: "home" });
    const token = encodeScenario(app.controller.getState().scenario);
    for (const alias of ["https://evil.example", "good.safe.words\n", "../good.safe.words", "a".repeat(64), "good.safe.words?x=1"]) {
      expect(app.rememberShortLink(token, alias)).toBe(false);
    }
    expect(app.rememberShortLink("v3.broken", "maple.river.sunny")).toBe(false);
    expect(web.writes).toHaveLength(1);
    expect(app.rememberShortLink(token, "maple.river.sunny")).toBe(true);
    expect(app.rememberShortLink(encodeScenario(pick(2)), "maple.river.sunny")).toBe(false);
    expect(web.url()).toBe("/s/maple.river.sunny");
    app.dispose();
    expect(app.rememberShortLink(token, "blue.river.sunny")).toBe(false);
  });

  it("hydrates without writing and uses replaceState-style updates for edits and undo", () => {
    const web = adapter("/?from=friend");
    const app = createBrowserController(web.web, "/");
    expect(web.writes).toEqual([]);
    app.controller.update(1, { homeScore: 2 }, "field");
    app.controller.update(1, { homeScore: 24 }, "field");
    expect(web.writes).toHaveLength(2);
    expect(web.url()).toContain("/?from=friend#predictions=v3.");
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
    expect(web.url()).toContain("#predictions=v3.AoA");
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
      expect(web.url()).toContain("/#predictions=v3.");
      expect(createBrowserController(adapter(web.url()).web, "/").controller.getState().scenario.tournamentId).toBe("rwc2023");
    }
  });

  it("hydrates an original v2 link unchanged, then writes a sparse v3 link after editing", () => {
    const web = adapter(`/?from=friend#predictions=${originalV2}`);
    const app = createBrowserController(web.web, "/");
    expect(app.urlError()).toBeUndefined();
    expect(web.writes).toEqual([]);
    expect(web.url()).toContain(originalV2);
    expect(app.controller.getState().scenario.resolved?.[1]).toEqual({ homeScore: 24, awayScore: 17, homeTries: 3, awayTries: 2, winner: "home" });
    app.controller.update(2, { winner: "away" });
    expect(web.url()).toContain("/?from=friend#predictions=v3.");
    expect(new URL(web.url(), "https://predict.example").hash.length).toBeLessThanOrEqual(28);
    const replay = createBrowserController(adapter(web.url()).web, "/");
    expect(replay.controller.getState().scenario).toEqual(app.controller.getState().scenario);
    expect(replay.controller.getState().canUndo).toBe(false);
    app.controller.undo();
    expect(web.url()).toBe("/?from=friend#predictions=v3.AYIKQA");
  });

  it("keeps an explicit zero and false bonus through compact sharing and navigation", () => {
    const web = adapter();
    const app = createBrowserController(web.web, "/");
    app.controller.update(1, { homeTries: 0, homeTryBonus: false });
    const picked = app.controller.getState().scenario;
    const url = web.url();
    expect(createBrowserController(adapter(url).web, "/").controller.getState().scenario).toEqual(picked);
    web.navigate("/");
    web.navigate(url);
    expect(app.controller.getState().scenario.predictions[1].intent).toEqual({ homeTries: 0, homeTryBonus: false });
    expect(app.controller.getState().canUndo).toBe(false);
    expect(web.writes).toHaveLength(1);
  });

  it("publishes a ranking batch through one URL update without changing the shared scenario version", () => {
    const web = adapter(`/?from=friend#predictions=${originalV2}`);
    const app = createBrowserController(web.web, "/");
    const before = app.controller.getState().scenario;
    const plan = planRankingFill(before);
    app.controller.applyBatch(plan.updates);
    expect(web.writes).toHaveLength(1);
    const filled = app.controller.getState().scenario;
    const url = web.url();
    expect(filled.completionVersion).toBe(before.completionVersion);
    expect(filled.schemaVersion).toBe(before.schemaVersion);
    expect(filled.tournamentId).toBe(before.tournamentId);
    expect(filled.datasetVersion).toBe(before.datasetVersion);
    expect(filled.rulesVersion).toBe(before.rulesVersion);
    expect(Object.keys(filled.resolved!)).toHaveLength(52);
    expect(filled.resolved![1]).toEqual(before.resolved![1]);
    expect(url).toContain("/?from=friend#predictions=v3.");
    const fresh = createBrowserController(adapter(url).web, "/");
    expect(fresh.controller.getState().scenario).toEqual(filled);
    expect(fresh.controller.getState().canUndo).toBe(false);
    app.controller.applyBatch(plan.updates);
    app.controller.applyBatch(planRankingFill(filled).updates);
    expect(web.writes).toHaveLength(1);
    app.controller.undo();
    expect(web.writes).toHaveLength(2);
    expect(app.controller.getState().scenario).toEqual(before);
    expect(web.url()).toBe("/?from=friend#predictions=v3.AYIKQA");
    app.controller.redo();
    expect(web.writes).toHaveLength(3);
    expect(web.url()).toBe(url);
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
    expect(web.url()).toContain("/tracker/?from=friend#predictions=v3.");
    web.navigate("/tracker/#predictions=broken");
    app.recover();
    expect(web.url()).toBe("/tracker/");
    const index = adapter("/tracker/index.html?from=friend");
    createBrowserController(index.web, "/tracker/").controller.update(1, { winner: "home" });
    expect(index.url()).toContain("/tracker/index.html?from=friend#predictions=");
    // A static host may use /s/ as its app root; that root is not an alias.
    for (const path of ["/s/", "/s/index.html"]) {
      const subpath = adapter(`${path}#predictions=${encodeScenario(pick())}`);
      const app = createBrowserController(subpath.web, "/s/");
      expect(app.urlError()).toBeUndefined();
      app.controller.update(2, { winner: "home" });
      expect(subpath.url()).toContain(`${path}#predictions=v3.`);
      app.dispose();
    }
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
