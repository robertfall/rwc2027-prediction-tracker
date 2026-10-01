/// <reference types="node" />
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createScenarioController, emptyScenario } from "../state/controller";
import { decodeScenario, encodeScenario } from "../state/codec";
import { captureShareSnapshot, createShareClient, SHARE_TIMEOUT_MS } from "./client";

function pickedSnapshot() {
  const controller = createScenarioController();
  controller.update(1, { winner: "home", homeTries: 0, homeTryBonus: false });
  return captureShareSnapshot(controller.getState().scenario, "https://predict.example/?from=friend");
}

function response(token: string, alias = "happy.blue.otter") {
  return Response.json({ token, alias });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Snapshot sharing without changing predictions", () => {
  it("captures exact choices before a request and leaves subsequent edits and undo intact", async () => {
    const controller = createScenarioController();
    controller.update(1, { winner: "home", homeTries: 0, homeTryBonus: false });
    const original = controller.getState();
    const snapshot = captureShareSnapshot(original.scenario, "https://predict.example/#predictions=old");
    const pending = deferred<Response>();
    const request = vi.fn<typeof fetch>().mockReturnValue(pending.promise);
    const client = createShareClient({ fetch: request });
    const sharing = client.getLink(snapshot);
    controller.update(2, { winner: "away" });
    const edited = controller.getState();
    pending.resolve(response(snapshot.token));

    expect(await sharing).toEqual({ url: "https://predict.example/s/happy.blue.otter", shortUnavailable: false });
    expect(JSON.parse(request.mock.calls[0][1]!.body as string)).toEqual({ token: encodeScenario(original.scenario) });
    expect(request.mock.calls[0][0]).toBe("/api/shares");
    expect(request.mock.calls[0][1]).toMatchObject({ method: "POST", headers: { "Content-Type": "application/json" } });
    expect(decodeScenario(snapshot.token)).toEqual(original.scenario);
    expect(controller.getState()).toBe(edited);
    controller.undo();
    expect(controller.getState().scenario).toEqual(original.scenario);
  });

  it("uses canonical full links for legacy paths and preserves configured app roots and queries", () => {
    const controller = createScenarioController(emptyScenario("rwc2023"));
    controller.update(1, { winner: "away" });
    const snapshot = captureShareSnapshot(controller.getState().scenario, "https://predict.example/tracker/AQH///8=?from=friend", "/tracker/");
    expect(snapshot.fullUrl).toBe(`https://predict.example/tracker/?from=friend#predictions=${snapshot.token}`);
    expect(decodeScenario(new URL(snapshot.fullUrl).hash.slice("#predictions=".length))).toEqual(controller.getState().scenario);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it("copies an empty 2027 app root without creating a short-link record", async () => {
    const request = vi.fn<typeof fetch>();
    const snapshot = captureShareSnapshot(emptyScenario(), "https://predict.example/?from=friend#predictions=old");
    expect(await createShareClient({ fetch: request, isOnline: () => false }).getLink(snapshot)).toEqual({
      url: "https://predict.example/", shortUnavailable: false,
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("retains an empty legacy tournament identity instead of sharing an empty 2027 root", async () => {
    const snapshot = captureShareSnapshot(emptyScenario("rwc2023"), "https://predict.example/");
    const request = vi.fn<typeof fetch>().mockResolvedValue(response(snapshot.token));
    expect(snapshot.empty).toBe(false);
    expect(decodeScenario(snapshot.token).tournamentId).toBe("rwc2023");
    expect(await createShareClient({ fetch: request }).getLink(snapshot)).toEqual({
      url: "https://predict.example/s/happy.blue.otter", shortUnavailable: false,
    });
    expect(request).toHaveBeenCalledOnce();
  });

  it("reuses known aliases offline without requests, while keeping different scenarios distinct", async () => {
    const snapshot = pickedSnapshot();
    const request = vi.fn<typeof fetch>().mockResolvedValue(response(snapshot.token));
    let online = true;
    const client = createShareClient({ fetch: request, isOnline: () => online });
    const first = await client.getLink(snapshot);
    online = false;
    expect(await client.getLink(snapshot)).toEqual(first);
    expect(request).toHaveBeenCalledOnce();
    const controller = createScenarioController();
    controller.update(1, { winner: "away" });
    const different = captureShareSnapshot(controller.getState().scenario, "https://predict.example/");
    expect(await client.getLink(different)).toEqual({ url: different.fullUrl, shortUnavailable: true });
    expect(request).toHaveBeenCalledOnce();
  });

  it("falls back immediately offline, without changing the captured state", async () => {
    const snapshot = pickedSnapshot();
    const request = vi.fn<typeof fetch>();
    expect(await createShareClient({ fetch: request, isOnline: () => false }).getLink(snapshot)).toEqual({
      url: snapshot.fullUrl, shortUnavailable: true,
    });
    expect(request).not.toHaveBeenCalled();
    expect(decodeScenario(snapshot.token).predictions[1].intent).toEqual({ winner: "home", homeTries: 0, homeTryBonus: false });
  });

  it("does not cache failures and retries when the service becomes available", async () => {
    const snapshot = pickedSnapshot();
    const request = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError("Network unavailable.")).mockResolvedValueOnce(response(snapshot.token));
    const client = createShareClient({ fetch: request });
    expect(await client.getLink(snapshot)).toEqual({ url: snapshot.fullUrl, shortUnavailable: true });
    expect(await client.getLink(snapshot)).toEqual({ url: "https://predict.example/s/happy.blue.otter", shortUnavailable: false });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("bounds a request even when the transport ignores abort, and ignores its late success", async () => {
    vi.useFakeTimers();
    const snapshot = pickedSnapshot();
    const pending = deferred<Response>();
    const request = vi.fn<typeof fetch>().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response(snapshot.token, "sunny.green.panda"));
    const client = createShareClient({ fetch: request });
    const sharing = client.getLink(snapshot);
    await vi.advanceTimersByTimeAsync(SHARE_TIMEOUT_MS);
    expect(await sharing).toEqual({ url: snapshot.fullUrl, shortUnavailable: true });
    expect(request.mock.calls[0][1]!.signal!.aborted).toBe(true);
    pending.resolve(response(snapshot.token));
    await Promise.resolve();
    expect(await client.getLink(snapshot)).toEqual({ url: "https://predict.example/s/sunny.green.panda", shortUnavailable: false });
    expect(request).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds a stalled response body as well as the initial connection", async () => {
    vi.useFakeTimers();
    const snapshot = pickedSnapshot();
    const request = vi.fn<typeof fetch>().mockResolvedValue({ ok: true, json: () => new Promise(() => {}) } as Response);
    const sharing = createShareClient({ fetch: request }).getLink(snapshot);
    await vi.advanceTimersByTimeAsync(SHARE_TIMEOUT_MS);
    expect(await sharing).toEqual({ url: snapshot.fullUrl, shortUnavailable: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([400, 429, 500, 503])("uses the full link on service HTTP %s", async (status) => {
    const snapshot = pickedSnapshot();
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("Unavailable", { status }));
    expect(await createShareClient({ fetch: request }).getLink(snapshot)).toEqual({ url: snapshot.fullUrl, shortUnavailable: true });
  });

  it.each([
    null,
    [],
    {},
    { alias: "happy.blue.otter", token: "v3.different" },
    { alias: "Happy.blue.otter" },
    { alias: "happy.blue" },
    { alias: "happy.blue.otter.extra" },
    { alias: "happy..otter" },
    { alias: "happy-blue-otter" },
    { alias: "happy.blue.otter/other" },
    { alias: "happy.blue.otter\n" },
    { alias: "happý.blue.otter" },
    { alias: `${"a".repeat(60)}.b.c` },
  ])("rejects changed predictions and malformed or unsafe aliases (%j)", async (value) => {
    const snapshot = pickedSnapshot();
    const body = value && !Array.isArray(value) ? { token: snapshot.token, ...value } : value;
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));
    expect(await createShareClient({ fetch: request }).getLink(snapshot)).toEqual({ url: snapshot.fullUrl, shortUnavailable: true });
  });

  it("uses the full link if the service returns malformed JSON", async () => {
    const snapshot = pickedSnapshot();
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("not JSON"));
    expect(await createShareClient({ fetch: request }).getLink(snapshot)).toEqual({ url: snapshot.fullUrl, shortUnavailable: true });
  });
});

describe("Read-only existing snapshot lookup", () => {
  it("looks up the exact canonical fingerprint without creating or changing the snapshot", async () => {
    const snapshot = pickedSnapshot();
    const before = decodeScenario(snapshot.token);
    const request = vi.fn<typeof fetch>().mockResolvedValue(response(snapshot.token));
    const client = createShareClient({ fetch: request });
    expect(client.cachedLink(snapshot)).toBeUndefined();
    const link = await client.findExistingLink(snapshot);
    expect(link).toEqual({ url: "https://predict.example/s/happy.blue.otter", shortUnavailable: false });
    const url = new URL(request.mock.calls[0][0] as string, snapshot.fullUrl);
    expect(url.pathname).toBe("/api/shares");
    expect([...url.searchParams]).toEqual([["fingerprint", createHash("sha256").update(snapshot.token).digest("hex")]]);
    expect(request.mock.calls[0][1]).toMatchObject({ method: "GET", cache: "no-store" });
    expect(request.mock.calls[0][1]!.body).toBeUndefined();
    expect(client.cachedLink(snapshot)).toEqual(link);
    expect(await client.getLink(snapshot)).toEqual(link);
    expect(request).toHaveBeenCalledOnce();
    expect(decodeScenario(snapshot.token)).toEqual(before);
  });

  it("coalesces concurrent uncancelled lookups of identical state", async () => {
    const snapshot = pickedSnapshot();
    const requested = deferred<void>();
    const pending = deferred<Response>();
    const request = vi.fn<typeof fetch>().mockImplementation(() => { requested.resolve(undefined); return pending.promise; });
    const client = createShareClient({ fetch: request });
    const first = client.findExistingLink(snapshot);
    const second = client.findExistingLink(snapshot);
    await requested.promise;
    expect(request).toHaveBeenCalledOnce();
    pending.resolve(response(snapshot.token));
    expect(await first).toEqual(await second);
    expect(request).toHaveBeenCalledOnce();
  });

  it("does not negatively cache an absent state or create it while looking up", async () => {
    const snapshot = pickedSnapshot();
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 404 })).mockResolvedValueOnce(response(snapshot.token));
    const client = createShareClient({ fetch: request });
    expect(await client.findExistingLink(snapshot)).toBeUndefined();
    expect(client.cachedLink(snapshot)).toBeUndefined();
    expect(await client.findExistingLink(snapshot)).toEqual({ url: "https://predict.example/s/happy.blue.otter", shortUnavailable: false });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });

  it("allows explicit sharing to create a link after an absent read-only lookup", async () => {
    const snapshot = pickedSnapshot();
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 404 })).mockResolvedValueOnce(response(snapshot.token));
    const client = createShareClient({ fetch: request });
    expect(await client.findExistingLink(snapshot)).toBeUndefined();
    expect(await client.getLink(snapshot)).toEqual({ url: "https://predict.example/s/happy.blue.otter", shortUnavailable: false });
    expect(request.mock.calls.map(([, init]) => init?.method)).toEqual(["GET", "POST"]);
  });

  it("reuses manually shared aliases synchronously and offline without WebCrypto or lookup requests", async () => {
    const snapshot = pickedSnapshot();
    const request = vi.fn<typeof fetch>().mockResolvedValue(response(snapshot.token));
    let online = true;
    const client = createShareClient({ fetch: request, isOnline: () => online });
    const link = await client.getLink(snapshot);
    online = false;
    vi.stubGlobal("crypto", undefined);
    expect(client.cachedLink(snapshot)).toEqual(link);
    expect(await client.findExistingLink(snapshot)).toEqual(link);
    expect(request).toHaveBeenCalledOnce();
  });

  it("skips empty current scenarios, offline misses and already-cancelled lookups", async () => {
    const request = vi.fn<typeof fetch>();
    const client = createShareClient({ fetch: request });
    const snapshot = pickedSnapshot();
    expect(await client.findExistingLink(captureShareSnapshot(emptyScenario(), "https://predict.example/"))).toBeUndefined();
    const abort = new AbortController();
    abort.abort();
    expect(await client.findExistingLink(snapshot, abort.signal)).toBeUndefined();
    expect(await createShareClient({ fetch: request, isOnline: () => false }).findExistingLink(snapshot)).toBeUndefined();
    expect(request).not.toHaveBeenCalled();
  });

  it("looks up an empty legacy tournament using its own canonical identity", async () => {
    const snapshot = captureShareSnapshot(emptyScenario("rwc2023"), "https://predict.example/");
    const request = vi.fn<typeof fetch>().mockResolvedValue(response(snapshot.token));
    expect(await createShareClient({ fetch: request }).findExistingLink(snapshot)).toEqual({
      url: "https://predict.example/s/happy.blue.otter", shortUnavailable: false,
    });
    expect(request.mock.calls[0][1]!.method).toBe("GET");
  });

  it.each([
    null,
    [],
    { alias: "happy.blue.otter", token: "v3.different" },
    { alias: "happy.blue.otter\n" },
    { alias: "happy.blue.otter/other" },
    { alias: "happý.blue.otter" },
    { alias: `${"a".repeat(60)}.b.c` },
  ])("rejects unsafe lookup responses without caching them (%j)", async (value) => {
    const snapshot = pickedSnapshot();
    const body = value && !Array.isArray(value) ? { token: snapshot.token, ...value } : value;
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));
    const client = createShareClient({ fetch: request });
    expect(await client.findExistingLink(snapshot)).toBeUndefined();
    expect(client.cachedLink(snapshot)).toBeUndefined();
    expect(request.mock.calls[0][1]!.method).toBe("GET");
  });

  it.each([404, 429, 500, 503])("quietly ignores HTTP %s without a fallback or creation request", async (status) => {
    const snapshot = pickedSnapshot();
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }));
    const client = createShareClient({ fetch: request });
    expect(await client.findExistingLink(snapshot)).toBeUndefined();
    expect(client.cachedLink(snapshot)).toBeUndefined();
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][1]!.method).toBe("GET");
  });

  it("quietly ignores network and JSON errors and remains retryable", async () => {
    const snapshot = pickedSnapshot();
    const request = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError("Offline")).mockResolvedValueOnce(new Response("bad JSON")).mockResolvedValueOnce(response(snapshot.token));
    const client = createShareClient({ fetch: request });
    expect(await client.findExistingLink(snapshot)).toBeUndefined();
    expect(await client.findExistingLink(snapshot)).toBeUndefined();
    expect(client.cachedLink(snapshot)).toBeUndefined();
    expect(await client.findExistingLink(snapshot)).toEqual({ url: "https://predict.example/s/happy.blue.otter", shortUnavailable: false });
    expect(request.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });

  it("cancels an ignored-abort transport promptly and never caches its late response", async () => {
    vi.useFakeTimers();
    const snapshot = pickedSnapshot();
    const requested = deferred<void>();
    const pending = deferred<Response>();
    const request = vi.fn<typeof fetch>().mockImplementation(() => { requested.resolve(undefined); return pending.promise; });
    const client = createShareClient({ fetch: request });
    const abort = new AbortController();
    const removeListener = vi.spyOn(abort.signal, "removeEventListener");
    const lookup = client.findExistingLink(snapshot, abort.signal);
    await requested.promise;
    abort.abort();
    expect(await lookup).toBeUndefined();
    expect(request.mock.calls[0][1]!.signal!.aborted).toBe(true);
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    pending.resolve(response(snapshot.token));
    await Promise.resolve();
    expect(client.cachedLink(snapshot)).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps independently cancellable callers separate and rejects a superseded response", async () => {
    const snapshot = pickedSnapshot();
    const firstRequest = deferred<void>();
    const secondRequest = deferred<void>();
    const firstResponse = deferred<Response>();
    const secondResponse = deferred<Response>();
    const request = vi.fn<typeof fetch>()
      .mockImplementationOnce(() => { firstRequest.resolve(undefined); return firstResponse.promise; })
      .mockImplementationOnce(() => { secondRequest.resolve(undefined); return secondResponse.promise; });
    const client = createShareClient({ fetch: request });
    const firstAbort = new AbortController();
    const secondAbort = new AbortController();
    const first = client.findExistingLink(snapshot, firstAbort.signal);
    await firstRequest.promise;
    const second = client.findExistingLink(snapshot, secondAbort.signal);
    await secondRequest.promise;
    firstAbort.abort();
    expect(await first).toBeUndefined();
    expect(request.mock.calls[1][1]!.signal!.aborted).toBe(false);
    secondResponse.resolve(response(snapshot.token, "sunny.green.panda"));
    expect(await second).toEqual({ url: "https://predict.example/s/sunny.green.panda", shortUnavailable: false });
    firstResponse.resolve(response(snapshot.token));
    await Promise.resolve();
    expect(client.cachedLink(snapshot)).toEqual({ url: "https://predict.example/s/sunny.green.panda", shortUnavailable: false });
  });

  it("times out a transport that ignores abort, discards late success and retries", async () => {
    vi.useFakeTimers();
    const snapshot = pickedSnapshot();
    const requested = deferred<void>();
    const pending = deferred<Response>();
    const request = vi.fn<typeof fetch>().mockImplementationOnce(() => { requested.resolve(undefined); return pending.promise; })
      .mockResolvedValueOnce(response(snapshot.token, "sunny.green.panda"));
    const client = createShareClient({ fetch: request });
    const lookup = client.findExistingLink(snapshot);
    await requested.promise;
    await vi.advanceTimersByTimeAsync(SHARE_TIMEOUT_MS);
    expect(await lookup).toBeUndefined();
    expect(request.mock.calls[0][1]!.signal!.aborted).toBe(true);
    pending.resolve(response(snapshot.token));
    await Promise.resolve();
    expect(client.cachedLink(snapshot)).toBeUndefined();
    expect(await client.findExistingLink(snapshot)).toEqual({ url: "https://predict.example/s/sunny.green.panda", shortUnavailable: false });
    expect(request).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["cancel", "timeout"])("bounds fingerprint computation and prevents a late request after %s", async (action) => {
    vi.useFakeTimers();
    const snapshot = pickedSnapshot();
    const digest = deferred<ArrayBuffer>();
    vi.stubGlobal("crypto", { subtle: { digest: vi.fn().mockReturnValue(digest.promise) } });
    const request = vi.fn<typeof fetch>();
    const client = createShareClient({ fetch: request });
    const abort = new AbortController();
    const lookup = client.findExistingLink(snapshot, abort.signal);
    if (action === "cancel") abort.abort();
    else await vi.advanceTimersByTimeAsync(SHARE_TIMEOUT_MS);
    expect(await lookup).toBeUndefined();
    digest.resolve(new ArrayBuffer(32));
    await Promise.resolve();
    expect(request).not.toHaveBeenCalled();
    expect(client.cachedLink(snapshot)).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("quietly skips uncached lookups when secure-context hashing is unavailable", async () => {
    const snapshot = pickedSnapshot();
    vi.stubGlobal("crypto", undefined);
    const request = vi.fn<typeof fetch>();
    expect(await createShareClient({ fetch: request }).findExistingLink(snapshot)).toBeUndefined();
    expect(request).not.toHaveBeenCalled();
  });
});
