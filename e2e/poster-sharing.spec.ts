import { expect, test, type Page, type Route } from "@playwright/test";
import { readFile } from "node:fs/promises";

interface StoredPoster {
  alias: string;
  token: string;
  teamId: string;
  timeZone: string;
  showPredictions: boolean;
  rendererVersion: string;
  imageUrl: string;
  pageUrl: string;
}

interface PosterUpload {
  token: string;
  teamId: string;
  timeZone: string;
  showPredictions: boolean;
  rendererVersion: string;
  png: string;
}

const poster = (page: Page) => page.getByRole("dialog", { name: "Pool match infographic", exact: true });
const copy = (page: Page) => poster(page).getByRole("button", { name: "Copy share link", exact: true });
const showPredictions = (page: Page) => poster(page).getByRole("switch", { name: "Show predictions", exact: true });
const card = (page: Page, id: number) => page.locator(`[data-fixture-id="${id}"]`);
const focus = (page: Page) => page.getByRole("combobox", { name: "Focus", exact: true });
const undo = (page: Page) => page.getByRole("button", { name: "Undo last prediction action", exact: true });
const tokenIn = (url: string) => new URL(url).hash.slice("#predictions=".length);
const aliasPattern = /^[a-z]+\.[a-z]+\.[a-z]+$/;
const isPublish = (url: string, method: string) => method === "POST" && new URL(url).pathname === "/api/posters";

test.use({ timezoneId: "Africa/Johannesburg", locale: "en-GB" });
test.beforeEach(async ({ page }) => {
  await page.route("**/api/shares?fingerprint=*", (route) => route.fulfill({ status: 404, json: { error: "Prediction link not found." } }));
});

async function captureClipboard(page: Page, blocked = false): Promise<void> {
  await page.addInitScript((fail) => {
    Reflect.set(window, "copiedPosterLink", "");
    Reflect.set(window, "posterClipboardSettled", 0);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async (value: string) => {
        if (fail) throw new DOMException("Clipboard blocked", "NotAllowedError");
        Reflect.set(window, "copiedPosterLink", value);
      },
      write: async (items: ClipboardItem[]) => {
        try {
          if (fail) throw new DOMException("Clipboard blocked", "NotAllowedError");
          const blob = await items[0].getType("text/plain");
          Reflect.set(window, "copiedPosterLink", await blob.text());
        } finally { Reflect.set(window, "posterClipboardSettled", Number(Reflect.get(window, "posterClipboardSettled")) + 1); }
      },
    } });
  }, blocked);
}

async function copiedLink(page: Page): Promise<string> {
  await expect.poll(() => page.evaluate(() => String(Reflect.get(window, "copiedPosterLink")))).not.toBe("");
  return page.evaluate(() => String(Reflect.get(window, "copiedPosterLink")));
}

async function selectTeam(page: Page, id: string): Promise<void> {
  await focus(page).click();
  await page.getByRole("listbox", { name: "Focus teams", exact: true }).getByRole("option")
    .and(page.locator(`[data-team-id="${id}"]`)).click();
}

async function openPoster(page: Page, teamName: string): Promise<void> {
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await page.getByRole("dialog", { name: "Share predictions", exact: true })
    .getByRole("button", { name: `Share Pool Matches - ${teamName}`, exact: true }).click();
  await expect(poster(page)).toBeVisible();
  await expect(poster(page).getByRole("button", { name: "Download PNG", exact: true })).toBeEnabled();
  await expect(copy(page)).toBeEnabled();
}

async function svgSnapshot(page: Page) {
  const image = poster(page).locator(".pool-infographic-preview");
  await expect(image).toBeVisible();
  return image.evaluate(async (element) => {
    if (!(element instanceof HTMLImageElement)) throw new Error("The poster must have an SVG preview.");
    const svg = await (await fetch(element.src)).text();
    const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
    return {
      svg, description: parsed.querySelector("desc")?.textContent,
      rows: [...parsed.querySelectorAll('g[id^="match-"]')].map((row) => ({ id: row.id, text: row.textContent ?? "" })),
    };
  });
}

async function publish(page: Page): Promise<{ stored: StoredPoster; upload: PosterUpload }> {
  const waitingRequest = page.waitForRequest((request) => isPublish(request.url(), request.method()));
  const waitingResponse = page.waitForResponse((response) => isPublish(response.url(), response.request().method()));
  await copy(page).click();
  const response = await waitingResponse;
  expect(response.status()).toBe(200);
  const stored = await response.json() as StoredPoster;
  const upload = (await waitingRequest).postDataJSON() as PosterUpload;
  expect(stored.alias).toMatch(aliasPattern);
  expect(stored.rendererVersion).toBe("pool-poster-v2");
  expect(stored.imageUrl).toBe(`/i/${stored.alias}.png`);
  expect(stored.pageUrl).toBe(`/p/${stored.alias}`);
  return { stored, upload };
}

test("explicit poster sharing stores its exact PNG and returns visitors from a no-JS image page to the captured predictor", async ({ page, request, browser, baseURL }) => {
  test.setTimeout(60000);
  await captureClipboard(page);
  const uploads: string[] = [];
  page.on("request", (request) => { if (isPublish(request.url(), request.method())) uploads.push(request.url()); });
  await page.goto("/");
  await card(page, 7).getByRole("button", { name: "South Africa", exact: true }).click();
  await selectTeam(page, "za");
  const clickedUrl = page.url(); const clickedToken = tokenIn(clickedUrl);
  const historyLength = await page.evaluate(() => history.length);
  await openPoster(page, "South Africa");
  expect(uploads).toEqual([]);
  const captured = await svgSnapshot(page);
  expect(captured.rows[0].text).toContain("24 – 17");
  const { stored, upload } = await publish(page);
  const link = await copiedLink(page);
  const imageUrl = new URL(stored.imageUrl, baseURL).href;
  expect(link).toBe(new URL(stored.pageUrl, baseURL).href);
  expect(upload.token).toBe(clickedToken);
  expect(upload.teamId).toBe("za");
  expect(upload.timeZone).toBe("Africa/Johannesburg");
  expect(upload.showPredictions).toBe(true);
  expect(stored.token).toBe(clickedToken);
  await expect(poster(page).getByRole("status").filter({ hasText: "Share link copied" })).toBeVisible();
  await poster(page).getByText("Direct image URL", { exact: true }).click();
  await expect(poster(page).getByRole("textbox", { name: "Image URL", exact: true })).toHaveValue(imageUrl);
  expect((await svgSnapshot(page)).svg).toBe(captured.svg);
  expect(page.url()).toBe(clickedUrl);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await expect(undo(page)).toBeEnabled();

  const image = await request.get(stored.imageUrl);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toMatch(/^image\/png(?:;|$)/);
  expect(image.headers()["cache-control"]).toMatch(/public.*max-age=31536000.*immutable/);
  expect(image.headers()["x-content-type-options"]).toBe("nosniff");
  const bytes = await image.body();
  expect(bytes.equals(Buffer.from(upload.png, "base64"))).toBe(true);
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1080, 1808]);
  const imageHead = await request.head(stored.imageUrl);
  expect(imageHead.status()).toBe(200);
  expect(imageHead.headers()["content-type"]).toBe(image.headers()["content-type"]);
  expect(imageHead.headers().etag).toBe(image.headers().etag);
  expect(imageHead.headers()["cache-control"]).toBe(image.headers()["cache-control"]);
  expect(await imageHead.body()).toHaveLength(0);
  expect((await request.get(stored.imageUrl)).headers().etag).toBe(image.headers().etag);
  const repeated = await request.post("/api/posters", { data: upload, headers: { Origin: new URL(baseURL!).origin } });
  expect(repeated.status()).toBe(200);
  expect(await repeated.json()).toEqual(stored);

  const crawler = await browser.newContext({ baseURL, javaScriptEnabled: false });
  let destination!: string;
  try {
    const landing = await crawler.newPage();
    await landing.goto(link);
    await expect(landing.getByRole("img")).toHaveAttribute("src", stored.imageUrl);
    await expect(landing.locator("script")).toHaveCount(0);
    await expect(landing.locator('meta[property="og:image"]')).toHaveAttribute("content", imageUrl);
    await expect(landing.locator('meta[property="og:url"]')).toHaveAttribute("content", link);
    await expect(landing.locator('meta[property="og:title"]')).toHaveAttribute("content", /South Africa/);
    await expect(landing.locator('meta[name="twitter:image"]')).toHaveAttribute("content", imageUrl);
    destination = await landing.getByRole("link", { name: "Make your predictions", exact: true }).getAttribute("href") ?? "";
    const target = new URL(destination, baseURL);
    expect(target.pathname).toBe("/");
    expect(target.searchParams.get("focus")).toBe("za");
    expect(target.hash).toBe(`#predictions=${clickedToken}`);
    await landing.reload();
    await expect(landing.getByRole("img")).toHaveAttribute("src", stored.imageUrl);
    const landingHead = await request.head(stored.pageUrl);
    expect(landingHead.status()).toBe(200);
    expect(landingHead.headers()["content-type"]).toMatch(/^text\/html(?:;|$)/);
    expect(await landingHead.body()).toHaveLength(0);
  } finally { await crawler.close(); }

  const fresh = await browser.newContext({ baseURL, timezoneId: "UTC" });
  try {
    const predictor = await fresh.newPage();
    await predictor.route("**/api/shares?fingerprint=*", (route) => route.fulfill({ status: 404, json: { error: "Prediction link not found." } }));
    await predictor.goto(new URL(destination, baseURL).href);
    await expect(focus(predictor)).toHaveAttribute("data-team-id", "za");
    await expect(predictor.locator(".fixture-card")).toHaveCount(6);
    await expect(card(predictor, 7).getByRole("button", { name: "South Africa", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(undo(predictor)).toBeDisabled();
    expect(await predictor.evaluate(() => localStorage.getItem("rwc2027.focus-team.v1"))).toBeNull();
    await selectTeam(predictor, "nz");
    expect(new URL(predictor.url()).searchParams.has("focus")).toBe(false);
    expect(tokenIn(predictor.url())).toBe(clickedToken);
    await predictor.reload();
    await expect(focus(predictor)).toHaveAttribute("data-team-id", "nz");
    expect(await predictor.evaluate(() => localStorage.getItem("rwc2027.focus-team.v1"))).toBe("nz");
    await predictor.goto(new URL(destination, baseURL).href);
    await expect(focus(predictor)).toHaveAttribute("data-team-id", "za");
    expect(await predictor.evaluate(() => localStorage.getItem("rwc2027.focus-team.v1"))).toBe("nz");
    const invalidFocus = new URL(destination, baseURL);
    invalidFocus.searchParams.set("focus", "unknown-team");
    await predictor.goto(invalidFocus.href);
    await expect(focus(predictor)).toHaveAttribute("data-team-id", "nz");
    const duplicateFocus = new URL(destination, baseURL);
    duplicateFocus.searchParams.append("focus", "za");
    await predictor.goto(duplicateFocus.href);
    await expect(focus(predictor)).toHaveAttribute("data-team-id", "nz");
    expect(await predictor.evaluate(() => localStorage.getItem("rwc2027.focus-team.v1"))).toBe("nz");
  } finally { await fresh.close(); }
});

test("fixtures-only links exclude hidden predictions and remain distinct from another team's shared journey", async ({ page, request, browser, baseURL }) => {
  await captureClipboard(page);
  const uploads: PosterUpload[] = [];
  page.on("request", (request) => { if (isPublish(request.url(), request.method())) uploads.push(request.postDataJSON() as PosterUpload); });
  await page.goto("/");
  for (const id of [7, 21]) await card(page, id).getByRole("button", { name: "South Africa", exact: true }).click();
  await selectTeam(page, "za");
  const clickedUrl = page.url(); const clickedToken = tokenIn(clickedUrl);
  const historyLength = await page.evaluate(() => history.length);
  await openPoster(page, "South Africa");
  await showPredictions(page).uncheck();
  await expect(poster(page).getByRole("button", { name: "Download PNG", exact: true })).toBeEnabled();
  const fixtures = await svgSnapshot(page);
  expect(fixtures.description).not.toMatch(/predictions/i);
  expect(fixtures.rows.every((row) => !/PREDICTION|PICK|24 – 17/.test(row.text))).toBe(true);
  const { stored } = await publish(page);
  const link = await copiedLink(page);
  expect(stored.showPredictions).toBe(false);
  expect(stored.token).not.toBe(clickedToken);
  expect(uploads[0].token).toBe(stored.token);
  expect(uploads[0].showPredictions).toBe(false);
  const document = await request.get(stored.pageUrl);
  expect(await document.text()).not.toContain(clickedToken);
  await copy(page).click();
  expect(await copiedLink(page)).toBe(link);
  expect(uploads).toHaveLength(1);
  expect(page.url()).toBe(clickedUrl);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);

  const fresh = await browser.newContext({ baseURL });
  try {
    const landing = await fresh.newPage();
    await landing.goto(link);
    await expect(landing.locator('meta[property="og:description"]')).toHaveAttribute("content", /fixtures/i);
    await expect(landing.locator('meta[property="og:title"]')).toHaveAttribute("content", /pool fixtures/i);
    await landing.route("**/api/shares?fingerprint=*", (route) => route.fulfill({ status: 404, json: { error: "Prediction link not found." } }));
    await landing.getByRole("link", { name: "Make your predictions", exact: true }).click();
    await expect(focus(landing)).toHaveAttribute("data-team-id", "za");
    await expect(landing.getByRole("button", { name: /\bPools\b/ })).toContainText("0/36");
    await expect(landing.locator(".result-preview strong")).toHaveCount(0);
    await expect(undo(landing)).toBeDisabled();
  } finally { await fresh.close(); }

  await page.keyboard.press("Escape");
  await selectTeam(page, "nz");
  await openPoster(page, "New Zealand");
  await page.evaluate(() => { Reflect.set(window, "copiedPosterLink", ""); });
  const other = await publish(page);
  expect(other.stored.teamId).toBe("nz");
  expect(other.stored.alias).not.toBe(stored.alias);
  expect(other.stored.token).toBe(clickedToken);
  expect(await copiedLink(page)).toBe(new URL(other.stored.pageUrl, baseURL).href);
  expect((await svgSnapshot(page)).rows.map((row) => row.id)).toEqual(["match-3", "match-16", "match-25"]);
  expect(page.url()).toBe(clickedUrl);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await expect(undo(page)).toBeEnabled();
});

test("late publication cannot copy an obsolete image variant and each link keeps the modal's clicked snapshot", async ({ page, baseURL }) => {
  await captureClipboard(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let held: StoredPoster | undefined;
  let publishes = 0;
  await page.route("**/api/posters", async (route) => {
    publishes++;
    const response = await route.fetch();
    if (publishes === 1) {
      held = await response.json() as StoredPoster;
      await gate;
    }
    await route.fulfill({ response }).catch(() => undefined);
  });
  try {
    await page.goto("/");
    const blankUrl = page.url();
    await card(page, 7).getByRole("button", { name: "South Africa", exact: true }).click();
    await selectTeam(page, "za");
    const clickedToken = tokenIn(page.url());
    const historyLength = await page.evaluate(() => history.length);
    await openPoster(page, "South Africa");
    const waiting = page.waitForResponse((response) => isPublish(response.url(), response.request().method()));
    await copy(page).click();
    await expect.poll(() => held?.alias).toMatch(aliasPattern);
    await poster(page).getByRole("button", { name: "Close pool match infographic", exact: true }).focus();
    await page.keyboard.press("Control+z");
    expect(page.url()).toBe(blankUrl);
    await showPredictions(page).uncheck();
    await expect(poster(page).getByRole("button", { name: "Download PNG", exact: true })).toBeEnabled();
    release();
    await (await waiting).finished();
    await expect.poll(() => page.evaluate(() => Number(Reflect.get(window, "posterClipboardSettled")))).toBeGreaterThan(0);
    await expect(copy(page)).toBeEnabled();
    expect(await page.evaluate(() => Reflect.get(window, "copiedPosterLink"))).toBe("");
    await expect(poster(page).getByRole("textbox", { name: "Share link", exact: true })).toHaveCount(0);
    const hidden = await publish(page);
    expect(hidden.stored.showPredictions).toBe(false);
    expect(hidden.stored.token).not.toBe(clickedToken);
    expect(await copiedLink(page)).toBe(new URL(hidden.stored.pageUrl, baseURL).href);
    await showPredictions(page).check();
    await expect(poster(page).getByRole("button", { name: "Download PNG", exact: true })).toBeEnabled();
    expect((await svgSnapshot(page)).rows[0].text).toContain("24 – 17");
    await page.evaluate(() => { Reflect.set(window, "copiedPosterLink", ""); });
    await copy(page).click();
    expect(await copiedLink(page)).toBe(new URL(held!.pageUrl, baseURL).href);
    expect(held!.token).toBe(clickedToken);
    expect(page.url()).toBe(blankUrl);
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    await expect(undo(page)).toBeDisabled();
    await expect(page.getByRole("button", { name: "Redo prediction action", exact: true })).toBeEnabled();
  } finally { release(); }
});

test("clipboard, publishing and offline failures retain selectable links and local PNG downloads", async ({ page, context }) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await captureClipboard(page, true);
  await page.addInitScript(() => { Reflect.set(window, "ClipboardItem", undefined); });
  await page.setViewportSize({ width: 320, height: 812 });
  await page.goto("/");
  await card(page, 7).getByRole("button", { name: "South Africa", exact: true }).click();
  await selectTeam(page, "za");
  const clickedUrl = page.url(); const clickedToken = tokenIn(clickedUrl);
  const historyLength = await page.evaluate(() => history.length);
  await openPoster(page, "South Africa");
  const original = await publish(page);
  const manual = poster(page).getByRole("textbox", { name: "Share link", exact: true });
  await expect(poster(page).getByRole("status").filter({ hasText: "Select the share link below to copy it." })).toBeVisible();
  await expect(manual).toHaveValue(new URL(original.stored.pageUrl, page.url()).href);
  await manual.focus();
  expect(await manual.evaluate((element) => element instanceof HTMLInputElement && element.selectionStart === 0 && element.selectionEnd === element.value.length)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

  const unavailable = (route: Route) => route.fulfill({ status: 503, json: { error: "Poster storage unavailable." } });
  await page.route("**/api/posters", unavailable);
  await showPredictions(page).uncheck();
  await expect(poster(page).getByRole("button", { name: "Download PNG", exact: true })).toBeEnabled();
  await copy(page).click();
  await expect(poster(page).getByRole("status").filter({ hasText: "Permanent link unavailable." })).toBeVisible();
  const fallback = new URL(await manual.inputValue());
  expect(fallback.searchParams.get("focus")).toBe("za");
  expect(fallback.hash).toMatch(/^#predictions=v3\./);
  expect(tokenIn(fallback.href)).not.toBe(clickedToken);
  const downloadWaiting = page.waitForEvent("download");
  await poster(page).getByRole("button", { name: "Download PNG", exact: true }).click();
  const download = await downloadWaiting;
  const path = await download.path();
  if (!path) throw new Error("The local image must remain downloadable after publication fails.");
  const bytes = await readFile(path);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  await page.unroute("**/api/posters", unavailable);
  await page.keyboard.press("Escape");
  await selectTeam(page, "nz");
  await openPoster(page, "New Zealand");
  await context.setOffline(true);
  try {
    await copy(page).click();
    await expect(poster(page).getByRole("status").filter({ hasText: "Permanent link unavailable." })).toBeVisible();
    const offline = new URL(await poster(page).getByRole("textbox", { name: "Share link", exact: true }).inputValue());
    expect(offline.searchParams.get("focus")).toBe("nz");
    expect(tokenIn(offline.href)).toBe(clickedToken);
    await expect(poster(page).getByRole("button", { name: "Download PNG", exact: true })).toBeEnabled();
    expect(page.url()).toBe(clickedUrl);
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    await expect(undo(page)).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  } finally { await context.setOffline(false); }
});
