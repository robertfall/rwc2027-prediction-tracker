import { afterEach, describe, expect, it, vi } from "vitest";
import { createScenarioController, emptyScenario } from "../state/controller";
import { decodeScenario, encodeScenario } from "../state/codec";
import { capturePosterSnapshot, createPosterClient, type PosterSnapshot } from "./poster-client";

const origin = "https://predict.example";
const png = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
function captured() {
  const controller = createScenarioController();
  controller.update(7, { winner: "home", homeScore: 35, awayScore: 17 });
  return capturePosterSnapshot(controller.getState().scenario, "za", "Africa/Johannesburg", true, `${origin}/?match=7`);
}
function response(snapshot: PosterSnapshot, overrides: Record<string, unknown> = {}) {
  const metadata = { token: snapshot.token, teamId: snapshot.teamId, timeZone: snapshot.timeZone,
    showPredictions: snapshot.showPredictions, rendererVersion: snapshot.rendererVersion };
  return Response.json({ ...metadata, alias: "maple.river.sunny", pageUrl: "/p/maple.river.sunny", imageUrl: "/i/maple.river.sunny.png", ...overrides });
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Permanent posters without a server editing session", () => {
  it("captures choices, strips unrelated destinations and never publishes hidden predictions for either tournament", () => {
    for (const tournamentId of ["rwc2027", "rwc2023"] as const) {
      const controller = createScenarioController(emptyScenario(tournamentId));
      controller.update(7, { winner: "away", homeTries: 0, homeTryBonus: false });
      const before = controller.getState();
      const shown = capturePosterSnapshot(before.scenario, "za", "UTC", true, `${origin}/s/maple.river.sunny?match=7&focus=nz`);
      const hidden = capturePosterSnapshot(before.scenario, "za", "UTC", false, `${origin}/?match=7`);
      expect(Object.isFrozen(shown)).toBe(true);
      expect(shown.token).toBe(encodeScenario(before.scenario));
      expect(new URL(shown.fallbackUrl).search).toBe("?focus=za");
      expect(decodeScenario(hidden.token)).toEqual(emptyScenario(tournamentId));
      controller.update(1, { winner: "home" });
      expect(decodeScenario(shown.token)).toEqual(before.scenario);
      controller.undo();
      expect(controller.getState().scenario).toEqual(before.scenario);
    }
  });

  it("uploads exact bytes only on request, coalesces clicks and reuses a validated link offline", async () => {
    const snapshot = captured();
    let online = true;
    const request = vi.fn<typeof fetch>().mockResolvedValue(response(snapshot));
    const client = createPosterClient({ fetch: request, isOnline: () => online });
    const image = png();
    expect(request).not.toHaveBeenCalled();
    const [first, second] = await Promise.all([client.getLink(snapshot, image), client.getLink(snapshot, image)]);
    expect(first).toEqual({ url: `${origin}/p/maple.river.sunny`, imageUrl: `${origin}/i/maple.river.sunny.png`, unavailable: false });
    expect(second).toEqual(first);
    expect(request).toHaveBeenCalledOnce();
    const body = JSON.parse(request.mock.calls[0][1]!.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ token: snapshot.token, teamId: "za", timeZone: "Africa/Johannesburg", showPredictions: true, rendererVersion: "pool-poster-v2", png: "iVBORw==" });
    expect(body).not.toHaveProperty("fallbackUrl");
    online = false;
    expect(await client.getLink(snapshot, image)).toEqual(first);
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([
    { token: "v3.AYA" }, { teamId: "nz" }, { timeZone: "UTC" }, { showPredictions: false },
    { rendererVersion: "unknown" }, { alias: "bad/alias" }, { pageUrl: "https://evil.example" },
    { imageUrl: "//evil.example/image.png" },
  ])("rejects mismatched or external links without caching a failed upload (%j)", async (overrides) => {
    const snapshot = captured();
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response(snapshot, overrides)).mockResolvedValueOnce(response(snapshot));
    const client = createPosterClient({ fetch: request });
    const image = png();
    expect(await client.getLink(snapshot, image)).toEqual({ url: snapshot.fallbackUrl, unavailable: true });
    expect((await client.getLink(snapshot, image)).unavailable).toBe(false);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("keeps local downloads available for offline, absent, SVG and oversized image cases", async () => {
    const snapshot = captured();
    const request = vi.fn<typeof fetch>();
    const client = createPosterClient({ fetch: request, isOnline: () => false });
    expect(await client.getLink(snapshot, png())).toEqual({ url: snapshot.fallbackUrl, unavailable: true });
    const connected = createPosterClient({ fetch: request });
    for (const image of [undefined, new Blob(["svg"], { type: "image/svg+xml" }), new Blob([new Uint8Array(512 * 1024 + 1)], { type: "image/png" })]) {
      expect(await connected.getLink(snapshot, image)).toEqual({ url: snapshot.fallbackUrl, unavailable: true });
    }
    expect(request).not.toHaveBeenCalled();
  });

  it("times out ignored aborts and discards late replies, allowing a later retry", async () => {
    vi.useFakeTimers();
    const snapshot = captured();
    let release!: (value: Response) => void;
    const waiting = new Promise<Response>((resolve) => { release = resolve; });
    const request = vi.fn<typeof fetch>().mockReturnValueOnce(waiting).mockResolvedValueOnce(response(snapshot));
    const client = createPosterClient({ fetch: request, timeoutMs: 10 });
    const image = png();
    const first = client.getLink(snapshot, image);
    await vi.advanceTimersByTimeAsync(10);
    expect(await first).toEqual({ url: snapshot.fallbackUrl, unavailable: true });
    expect(request.mock.calls[0][1]!.signal!.aborted).toBe(true);
    release(response(snapshot));
    await Promise.resolve();
    expect((await client.getLink(snapshot, image)).unavailable).toBe(false);
    expect(request).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
