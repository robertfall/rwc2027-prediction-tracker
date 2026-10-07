import { afterEach, describe, expect, it, vi } from "vitest";
import { createScenarioController, emptyScenario } from "../state/controller";
import { buildPoolInfographicModel } from "./pool-infographic";

const options = { locale: "en-GB", timeZone: "Africa/Johannesburg" };
const minimalFlag = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><path fill="#245C4A" d="M0 0h4v3H0z"/></svg>';

function assetResponse(url: string): Response {
  return url.endsWith(".svg") ? new Response(minimalFlag, { headers: { "Content-Type": "image/svg+xml" } }) :
    new Response(new Uint8Array([119, 79, 70, 50]), { headers: { "Content-Type": "font/woff2" } });
}

function stubAssets() {
  const request = vi.fn<typeof fetch>().mockImplementation(async (input) => assetResponse(String(input)));
  vi.stubGlobal("fetch", request);
  return request;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("Pool infographic fixture and prediction capture", () => {
  it("selects only the focused team's own pool fixtures, in kickoff order, for both tournaments", () => {
    const derived = structuredClone(createScenarioController().getState().derived);
    derived.fixtures.reverse();
    const model = buildPoolInfographicModel(derived, "za", options);
    expect(model.matches.map((match) => match.id)).toEqual([7, 21, 36]);
    expect(model.matches.map((match) => match.away.shortName)).toEqual(["ITA", "GEO", "ROU"]);
    expect(model.matches.map((match) => match.venue)).toEqual(["Adelaide Oval, Adelaide", "Brisbane Stadium, Brisbane", "Perth Stadium, Perth"]);
    expect(model.matches.every((match) => match.home.id === "za" || match.away.id === "za")).toBe(true);
    expect(model.pool).toBe("B");
    expect(model.hasPredictions).toBe(false);
    expect(model.filename).toBe("rwc2027-south-africa-pool-matches");
    expect(buildPoolInfographicModel(createScenarioController(emptyScenario("rwc2023")).getState().derived, "za", options).matches).toHaveLength(4);
    expect(() => buildPoolInfographicModel(derived, "unknown", options)).toThrow("Choose a tournament team");
  });

  it("keeps valid scores, explicit zero and draws, while untouched games have no invented prediction", () => {
    const controller = createScenarioController();
    controller.update(1, { winner: "home" });
    expect(buildPoolInfographicModel(controller.getState().derived, "za", options).hasPredictions).toBe(false);
    controller.update(7, { winner: "home", homeScore: 35, awayScore: 17 });
    controller.update(21, { winner: "draw", homeScore: 0, awayScore: 0 });
    const model = buildPoolInfographicModel(controller.getState().derived, "za", options);
    expect(model.hasPredictions).toBe(true);
    expect(model.matches.map((match) => match.prediction)).toEqual([
      { kind: "score", winner: "home", homeScore: 35, awayScore: 17 },
      { kind: "score", winner: "draw", homeScore: 0, awayScore: 0 },
      { kind: "none" },
    ]);
  });

  it("does not publish conflicting completed values and retains a meaningful winner-only choice", () => {
    const controller = createScenarioController();
    controller.update(7, { winner: "home", homeScore: 10, awayScore: 20 });
    expect(buildPoolInfographicModel(controller.getState().derived, "za", options).matches[0].prediction).toEqual({ kind: "attention" });
    const derived = structuredClone(controller.getState().derived);
    const fixture = derived.fixtures.find((match) => match.id === 7)!;
    fixture.result = undefined; fixture.issues = []; fixture.prediction = { intent: { winner: "away" } };
    expect(buildPoolInfographicModel(derived, "za", options).matches[0].prediction).toEqual({ kind: "winner", winner: "away" });
  });

  it("hides scores, zero draws and conflicts without changing captured fixtures or predictions", () => {
    const controller = createScenarioController();
    controller.update(7, { winner: "home", homeScore: 35, awayScore: 17 });
    controller.update(21, { winner: "home", homeScore: 10, awayScore: 20 });
    controller.update(36, { winner: "draw", homeScore: 0, awayScore: 0 });
    const state = controller.getState();
    const shown = buildPoolInfographicModel(state.derived, "za", options);
    const hidden = buildPoolInfographicModel(state.derived, "za", { ...options, showPredictions: false });
    expect(shown.hasPredictions).toBe(true);
    expect(hidden.hasPredictions).toBe(false);
    expect(hidden.matches).toEqual(shown.matches.map((match) => ({ ...match, prediction: { kind: "none" } })));
    expect(buildPoolInfographicModel(state.derived, "za", { ...options, showPredictions: true })).toEqual(shown);
    expect(controller.getState()).toBe(state);
  });

  it("formats device-zone dates and times, including date rollover, and rejects an invalid timezone", () => {
    const derived = createScenarioController().getState().derived;
    const johannesburg = buildPoolInfographicModel(derived, "za", options);
    const utc = buildPoolInfographicModel(derived, "za", { locale: "en-GB", timeZone: "UTC" });
    const newYork = buildPoolInfographicModel(derived, "za", { locale: "en-GB", timeZone: "America/New_York" });
    expect(johannesburg.timeZone).toBe("Africa/Johannesburg");
    expect(johannesburg.matches[0]).toMatchObject({ date: "Sun 3 Oct", time: "05:45" });
    expect(utc.matches[0]).toMatchObject({ date: "Sun 3 Oct", time: "03:45" });
    expect(newYork.matches[0]).toMatchObject({ date: "Sat 2 Oct", time: "23:45" });
    expect(() => buildPoolInfographicModel(derived, "za", { timeZone: "invalid-zone" })).toThrow(RangeError);
  });
});

describe("Standalone pool poster output", () => {
  it("embeds its assets, exposes the three fixture rows and escapes XML text", async () => {
    vi.resetModules();
    const { createPoolInfographic } = await import("./pool-infographic");
    const request = stubAssets();
    const derived = structuredClone(createScenarioController().getState().derived);
    derived.tournament.teams.find((team) => team.id === "za")!.name = 'South & <Africa> "X"';
    derived.fixtures.find((fixture) => fixture.id === 7)!.venue = 'Oval & <Ground> "Adelaide"';
    const graphic = await createPoolInfographic(derived, "za", options);
    expect(graphic.svg).toContain('width="1080" height="1808"');
    expect([...graphic.svg.matchAll(/<g id="match-(\d+)"/g)].map((match) => Number(match[1]))).toEqual([7, 21, 36]);
    expect([...graphic.svg.matchAll(/<image href="(.*?)"/g)].map((match) => match[1])).toHaveLength(7);
    expect([...graphic.svg.matchAll(/<image href="(.*?)"/g)].every((match) => match[1].startsWith("data:image/svg+xml;base64,"))).toBe(true);
    expect(graphic.svg).toContain("data:font/woff2;base64,");
    expect(graphic.svg).toContain("South &amp; &lt;Africa&gt; &quot;X&quot;");
    expect(graphic.svg).not.toContain("<Africa>");
    expect(graphic.svg).toContain("Oval &amp; &lt;Ground&gt; &quot;Adelaide&quot;");
    expect(graphic.svg).not.toContain("<Ground>");
    expect(graphic.svg).toContain("Times in Africa/Johannesburg");
    expect(graphic.svg).toContain("MAKE YOUR PREDICTIONS");
    expect(graphic.svg).toContain("rwc2027.myplaceforthings.com");
    expect(graphic.svg).toContain("RWC 2027  /  POOL B");
    expect(graphic.svg).toContain(">FIXTURES</text>");
    expect(graphic.svg.match(/>RSA<\/text>/g)).toHaveLength(3);
    expect(graphic.svg.match(/>VS<\/text>/g)).toHaveLength(3);
    expect(graphic.svg).not.toMatch(/>PREDICTION<|FIXTURES &amp; PREDICTIONS/);
    expect(request.mock.calls.filter(([input]) => String(input).includes("/flags/")).map(([input]) => String(input)).sort()).toEqual([
      "/flags/4x3/ge.svg", "/flags/4x3/it.svg", "/flags/4x3/ro.svg", "/flags/4x3/za.svg",
    ]);
    expect(graphic.filename).not.toMatch(/\.(?:png|svg)$/);
  });

  it("captures the clicked team and scores before asset requests finish, without changing controller state", async () => {
    vi.resetModules();
    const { createPoolInfographic } = await import("./pool-infographic");
    const controller = createScenarioController();
    controller.update(7, { winner: "home", homeScore: 35, awayScore: 17 });
    const state = controller.getState();
    const derived = structuredClone(state.derived);
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async (input) => { await waiting; return assetResponse(String(input)); }));
    const pending = createPoolInfographic(derived, "za", options);
    derived.tournament.teams.find((team) => team.id === "za")!.name = "Changed name";
    derived.fixtures.find((fixture) => fixture.id === 7)!.result!.homeScore = 99;
    derived.fixtures.find((fixture) => fixture.id === 7)!.venue = "Changed venue";
    release();
    const graphic = await pending;
    expect(graphic.title).toBe("South Africa pool matches");
    expect(graphic.svg).toContain("35 – 17");
    expect(graphic.svg).not.toContain("99 – 17");
    expect(graphic.svg).toContain("Adelaide Oval, Adelaide");
    expect(graphic.svg).not.toContain("Changed venue");
    expect(graphic.svg).not.toContain("RSA PICK");
    expect(graphic.svg).toContain("FIXTURES &amp; PREDICTIONS");
    expect(graphic.svg).toContain(">PREDICTION</text>");
    expect(controller.getState()).toBe(state);
  });

  it("uses abbreviation placeholders for missing flags and rejects unsafe flag paths", async () => {
    vi.resetModules();
    const { createPoolInfographic } = await import("./pool-infographic");
    const request = vi.fn<typeof fetch>().mockImplementation(async (input) => String(input).endsWith("za.svg") ? new Response(null, { status: 404 }) : assetResponse(String(input)));
    vi.stubGlobal("fetch", request);
    const derived = structuredClone(createScenarioController().getState().derived);
    derived.tournament.teams.find((team) => team.id === "it")!.flag = "../../outside";
    const graphic = await createPoolInfographic(derived, "za", options);
    expect(graphic.svg).toContain(">RSA</text>");
    expect(graphic.svg).toContain(">ITA</text>");
    expect(graphic.svg).not.toContain("../../outside");
    expect(request.mock.calls.some(([input]) => String(input).includes("outside"))).toBe(false);
    expect([...graphic.svg.matchAll(/<image href=/g)]).toHaveLength(2);
  });

  it("shows attention instead of conflicting scores and keeps the maximum valid draw scores", async () => {
    vi.resetModules();
    const { createPoolInfographic } = await import("./pool-infographic");
    stubAssets();
    const controller = createScenarioController();
    controller.update(7, { winner: "home", homeScore: 10, awayScore: 20 });
    controller.update(21, { winner: "draw", homeScore: 255, awayScore: 255 });
    const graphic = await createPoolInfographic(controller.getState().derived, "za", options);
    expect(graphic.svg).toContain("Pick needs attention");
    expect(graphic.svg).not.toContain("10 – 20");
    expect(graphic.svg).toContain("255 – 255");
    expect(graphic.svg).not.toContain("DRAW PICK");
    const hidden = await createPoolInfographic(controller.getState().derived, "za", { ...options, showPredictions: false });
    expect(hidden.svg).not.toMatch(/>PREDICTION<|FIXTURES &amp; PREDICTIONS| PICK<|Pick needs attention|255 – 255|10 – 20/);
    expect(hidden.svg.match(/>VS<\/text>/g)).toHaveLength(3);
    const legacy = await createPoolInfographic(createScenarioController(emptyScenario("rwc2023")).getState().derived, "za", options);
    expect(legacy.svg).toContain('width="1080" height="2216"');
    expect(legacy.svg).toContain("Stade de Marseille");
    expect(legacy.svg).toContain("RWC 2023");
    expect([...legacy.svg.matchAll(/<g id="match-/g)]).toHaveLength(4);
  });

  it("retains the pick label when a winner or draw has no completed score", async () => {
    vi.resetModules();
    const { createPoolInfographic } = await import("./pool-infographic");
    stubAssets();
    const derived = structuredClone(createScenarioController().getState().derived);
    const homePick = derived.fixtures.find((fixture) => fixture.id === 7)!;
    homePick.prediction = { intent: { winner: "home" } };
    const drawPick = derived.fixtures.find((fixture) => fixture.id === 21)!;
    drawPick.prediction = { intent: { winner: "draw" } };
    const graphic = await createPoolInfographic(derived, "za", options);
    expect(graphic.svg).toContain("RSA PICK");
    expect(graphic.svg).toContain("DRAW PICK");
    expect(graphic.svg.match(/>PREDICTION<\/text>/g)).toHaveLength(2);
    expect(graphic.svg.match(/>VS<\/text>/g)).toHaveLength(3);
  });
});
