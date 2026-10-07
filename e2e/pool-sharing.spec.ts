import { expect, test, type Download, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const share = (page: Page) => page.getByRole("button", { name: "Share", exact: true });
const menu = (page: Page) => page.getByRole("dialog", { name: "Share predictions", exact: true });
const preview = (page: Page) => page.getByRole("dialog", { name: "Pool match infographic", exact: true });
const focus = (page: Page) => page.getByRole("combobox", { name: "Focus", exact: true });
const card = (page: Page, id: number) => page.locator(`[data-fixture-id="${id}"]`);
const undo = (page: Page) => page.getByRole("button", { name: "Undo last prediction action", exact: true });
const showPredictions = (page: Page) => preview(page).getByRole("switch", { name: "Show predictions", exact: true });
const southAfricaVenues = ["Adelaide Oval, Adelaide", "Brisbane Stadium, Brisbane", "Perth Stadium, Perth"];

test.use({ timezoneId: "Africa/Johannesburg", locale: "en-GB" });
test.beforeEach(async ({ page }) => {
  await page.route("**/api/shares?fingerprint=*", (route) => route.fulfill({ status: 404, json: { error: "Prediction link not found." } }));
});

async function selectTeam(page: Page, id: string): Promise<void> {
  await focus(page).click();
  await page.getByRole("listbox", { name: "Focus teams", exact: true }).getByRole("option")
    .and(page.locator(`[data-team-id="${id}"]`)).click();
  await expect(focus(page)).toHaveAttribute("data-team-id", id);
}

async function openPoster(page: Page, teamName: string): Promise<void> {
  await share(page).click();
  await menu(page).getByRole("button", { name: `Share Pool Matches - ${teamName}`, exact: true }).click();
  await expect(preview(page)).toBeVisible();
  await expect(preview(page).getByRole("heading", { name: teamName, exact: true })).toBeVisible();
}

async function poster(page: Page) {
  const image = preview(page).locator(".pool-infographic-preview");
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element) => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0)).toBe(true);
  return image.evaluate(async (element) => {
    if (!(element instanceof HTMLImageElement)) throw new Error("The infographic must have an image preview.");
    const svg = await (await fetch(element.src)).text();
    const document = new DOMParser().parseFromString(svg, "image/svg+xml");
    if (document.querySelector("parsererror")) throw new Error("The preview must contain valid SVG.");
    const texts = (root: ParentNode) => [...root.querySelectorAll("text")].map((node) => node.textContent ?? "").join(" ");
    const firstFlag = document.querySelector('g[id^="match-"] image');
    const firstRow = document.querySelector('g[id^="match-"]');
    const firstVenue = firstRow ? [...firstRow.querySelectorAll("text")].at(-1) : undefined;
    const venueSize = Number(firstVenue?.getAttribute("font-size"));
    return {
      svg, text: texts(document), description: document.querySelector("desc")?.textContent,
      width: element.naturalWidth, height: element.naturalHeight,
      rows: [...document.querySelectorAll('g[id^="match-"]')].map((row) => ({
        id: row.id, text: texts(row), venue: [...row.querySelectorAll("text")].at(-1)?.textContent,
      })),
      flags: [...document.querySelectorAll("image")].map((flag) => flag.getAttribute("href") ?? flag.getAttribute("xlink:href") ?? ""),
      flagBounds: firstFlag ? { x: Number(firstFlag.getAttribute("x")), y: Number(firstFlag.getAttribute("y")),
        width: Number(firstFlag.getAttribute("width")), height: Number(firstFlag.getAttribute("height")) } : undefined,
      venueBounds: firstVenue ? { x: 108, y: Number(firstVenue.getAttribute("y")) - Math.ceil(venueSize * 0.6),
        width: 864, height: Math.ceil(venueSize * 0.8) } : undefined,
    };
  });
}

async function downloaded(download: Download): Promise<Buffer> {
  const path = await download.path();
  if (!path) throw new Error("The image download must produce a local artifact.");
  return readFile(path);
}

test("Share offers full tournament URLs and disables pool images until Focus is selected", async ({ page }) => {
  await page.goto("/");
  const originalUrl = page.url();
  const historyLength = await page.evaluate(() => history.length);
  await share(page).focus();
  await share(page).press("Enter");
  await expect(menu(page)).toBeVisible();
  const copy = menu(page).getByRole("button", { name: "Copy URL - Share Full Tournament", exact: true });
  await expect(copy).toBeEnabled();
  await expect(copy).toBeFocused();
  await expect(menu(page).getByRole("button", { name: "Share Pool Matches", exact: true })).toBeDisabled();
  await copy.press("Escape");
  await expect(menu(page)).toHaveCount(0);
  await expect(share(page)).toBeFocused();

  await selectTeam(page, "za");
  await share(page).click();
  await copy.press("ArrowDown");
  await expect(menu(page).getByRole("button", { name: "Share Pool Matches - South Africa", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(share(page)).toBeFocused();
  await share(page).click();
  await page.locator(".wordmark").click();
  await expect(menu(page)).toHaveCount(0);
  expect(page.url()).toBe(originalUrl);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await expect(undo(page)).toBeDisabled();
});

test("unpicked pool posters retain their venues and embedded flags in 2027 and legacy PNGs", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/shares") writes.push(request.url());
  });
  await page.goto("/");
  await selectTeam(page, "za");
  const originalUrl = page.url();
  const historyLength = await page.evaluate(() => history.length);
  await openPoster(page, "South Africa");
  await expect(showPredictions(page)).toBeChecked();
  const artifact = await poster(page);
  expect(artifact.rows.map((row) => row.id)).toEqual(["match-7", "match-21", "match-36"]);
  expect(artifact.rows.map((row) => row.venue)).toEqual(southAfricaVenues);
  for (const row of artifact.rows) expect(row.text).toMatch(/\bVS\b/);
  expect(artifact.flags.length).toBeGreaterThanOrEqual(6);
  expect(artifact.flags.every((flag) => flag.startsWith("data:image/svg+xml;base64,"))).toBe(true);
  expect(new Set(artifact.flags).size).toBe(4);
  expect(artifact.svg).toContain("data:font/");
  expect(artifact.text).toContain("Africa/Johannesburg");
  expect(artifact.text).toMatch(/RWC 2027\s+\/\s+POOL B/);
  expect(artifact.text).toContain("FIXTURES");
  expect(artifact.text).toContain("MAKE YOUR PREDICTIONS");
  expect([artifact.width, artifact.height]).toEqual([1080, 1808]);
  await expect(preview(page).getByRole("button", { name: "Download PNG", exact: true })).toBeEnabled();
  await expect(preview(page).getByRole("button", { name: "Download SVG", exact: true })).toHaveCount(0);
  const waiting = page.waitForEvent("download");
  await preview(page).getByRole("button", { name: "Download PNG", exact: true }).click();
  const download = await waiting;
  expect(download.suggestedFilename()).toMatch(/south-africa.*\.png$/);
  const bytes = await downloaded(download);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(bytes.subarray(12, 16).toString("ascii")).toBe("IHDR");
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1080, 1808]);
  // Check the downloaded pixels, not just the SVG's declared flag references.
  const flagColors = await page.evaluate(async ({ encoded, bounds }) => {
    if (!bounds) throw new Error("The poster must contain a visible match flag.");
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve(); image.onerror = () => reject(new Error("The downloaded PNG must decode."));
      image.src = `data:image/png;base64,${encoded}`;
    });
    const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The PNG must be inspectable.");
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(bounds.x + 2, bounds.y + 2, bounds.width - 4, bounds.height - 4);
    const colors = new Set<string>();
    for (let offset = 0; offset < data.length; offset += 4) {
      colors.add(`${data[offset] >> 4},${data[offset + 1] >> 4},${data[offset + 2] >> 4}`);
    }
    canvas.width = 0; canvas.height = 0;
    return colors.size;
  }, { encoded: bytes.toString("base64"), bounds: artifact.flagBounds });
  expect(flagColors).toBeGreaterThan(4);
  const venuePixels = await page.evaluate(async ({ encoded, bounds }) => {
    if (!bounds) throw new Error("The poster must contain a venue below its kickoff time.");
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve(); image.onerror = () => reject(new Error("The downloaded PNG must decode."));
      image.src = `data:image/png;base64,${encoded}`;
    });
    const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The venue in the PNG must be inspectable.");
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
    let darkPixels = 0;
    for (let offset = 0; offset < data.length; offset += 4) {
      if (data[offset] < 160 && data[offset + 1] < 160 && data[offset + 2] < 160 && data[offset + 3] > 0) darkPixels++;
    }
    canvas.width = 0; canvas.height = 0;
    return darkPixels;
  }, { encoded: bytes.toString("base64"), bounds: artifact.venueBounds });
  expect(venuePixels, "The downloaded PNG must draw the venue text").toBeGreaterThan(100);
  await page.keyboard.press("Escape");
  await expect(preview(page)).toHaveCount(0);
  await expect(share(page)).toBeFocused();
  expect(page.url()).toBe(originalUrl);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  expect(writes).toEqual([]);
  await expect(undo(page)).toBeDisabled();
  await expect(page.locator(".result-preview strong")).toHaveCount(0);

  await page.goto("/#predictions=v3.AoA");
  await selectTeam(page, "za");
  await openPoster(page, "South Africa");
  const legacy = await poster(page);
  expect(legacy.rows).toHaveLength(4);
  expect(legacy.rows.every((row) => /\bVS\b/.test(row.text))).toBe(true);
  expect(legacy.rows.map((row) => row.venue)).toEqual(["Stade de Marseille", "Stade de Bordeaux", "Stade de France", "Stade de Marseille"]);
  expect([legacy.width, legacy.height]).toEqual([1080, 2216]);
  const legacyButton = preview(page).getByRole("button", { name: "Download PNG", exact: true });
  await expect(legacyButton).toBeEnabled();
  const legacyWaiting = page.waitForEvent("download");
  await legacyButton.click();
  const legacyBytes = await downloaded(await legacyWaiting);
  expect([legacyBytes.readUInt32BE(16), legacyBytes.readUInt32BE(20)]).toEqual([1080, 2216]);
  await page.keyboard.press("Escape");
});

test("the prediction switch retains its captured snapshot and ignores stale PNG completions", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    const finish: (() => void)[] = [];
    const blobs: (Blob | null)[] = [];
    Reflect.set(window, "finishPoolImages", finish);
    Reflect.set(window, "poolImageBlobs", blobs);
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      original.call(this, (blob) => {
        blobs.push(blob);
        finish.push(() => callback(blob));
      }, type, quality);
    };
  });
  await page.goto("/");
  const blankUrl = page.url();
  await selectTeam(page, "za");
  await card(page, 7).getByRole("button", { name: "South Africa", exact: true }).click();
  const pickedUrl = page.url();
  const historyLength = await page.evaluate(() => history.length);
  await openPoster(page, "South Africa");
  await expect(showPredictions(page)).toBeChecked();
  await expect.poll(() => page.evaluate(() => (Reflect.get(window, "finishPoolImages") as unknown[]).length)).toBe(1);
  await expect(preview(page).getByRole("button", { name: "Download PNG", exact: true })).toBeDisabled();
  const captured = await poster(page);
  expect(captured.rows.map((row) => row.venue)).toEqual(southAfricaVenues);
  expect(captured.rows[0].text).toContain("24 – 17");
  expect(captured.rows[0].text).toContain("PREDICTION");
  expect(captured.rows[0].text).not.toContain("RSA PICK");
  expect(captured.text).toContain("FIXTURES & PREDICTIONS");
  expect(captured.rows.slice(1).every((row) => /\bVS\b/.test(row.text))).toBe(true);
  expect(page.url()).toBe(pickedUrl);

  await showPredictions(page).focus();
  await showPredictions(page).press("Space");
  await expect(showPredictions(page)).not.toBeChecked();
  await expect(showPredictions(page)).toBeFocused();
  await expect.poll(() => page.evaluate(() => (Reflect.get(window, "finishPoolImages") as unknown[]).length)).toBe(2);
  const fixturesOnly = await poster(page);
  expect(fixturesOnly.rows.every((row) => /\bVS\b/.test(row.text))).toBe(true);
  expect(fixturesOnly.rows.every((row) => !/\bPREDICTIONS?\b|\bPICK\b|Pick needs attention/i.test(row.text))).toBe(true);
  expect(fixturesOnly.description).not.toMatch(/predictions/i);
  expect(fixturesOnly.rows.map((row) => row.id)).toEqual(captured.rows.map((row) => row.id));
  expect(fixturesOnly.flags).toEqual(captured.flags);
  expect(fixturesOnly.rows.map((row) => row.venue)).toEqual(southAfricaVenues);

  // Return to ON before either rasterization finishes. OFF must not publish a stale download.
  await showPredictions(page).press("Space");
  await expect(showPredictions(page)).toBeChecked();
  await expect.poll(async () => (await poster(page)).svg).toBe(captured.svg);
  await page.evaluate(() => { (Reflect.get(window, "finishPoolImages") as (() => void)[])[1](); });
  await expect(preview(page).getByRole("button", { name: "Download PNG", exact: true })).toBeDisabled();
  expect((await poster(page)).svg).toBe(captured.svg);
  expect(page.url()).toBe(pickedUrl);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);

  await preview(page).getByRole("button", { name: "Close pool match infographic", exact: true }).focus();
  await page.keyboard.press("Control+z");
  expect(page.url()).toBe(blankUrl);
  await page.evaluate(() => { (Reflect.get(window, "finishPoolImages") as (() => void)[])[0](); });
  await expect(preview(page).getByRole("button", { name: "Download PNG", exact: true })).toBeEnabled();
  expect((await poster(page)).svg).toBe(captured.svg);

  // Both rendered variants are reused. The OFF download must be the corresponding PNG.
  await showPredictions(page).press("Space");
  await expect(showPredictions(page)).not.toBeChecked();
  await expect.poll(async () => (await poster(page)).svg).toBe(fixturesOnly.svg);
  const downloadButton = preview(page).getByRole("button", { name: "Download PNG", exact: true });
  await expect(downloadButton).toBeEnabled();
  const waiting = page.waitForEvent("download");
  await downloadButton.click();
  const bytes = await downloaded(await waiting);
  const expectedDigest = await page.evaluate(async () => {
    const blob = (Reflect.get(window, "poolImageBlobs") as (Blob | null)[])[1];
    if (!blob) throw new Error("The fixtures-only PNG must be available.");
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  });
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(expectedDigest);
  await showPredictions(page).press("Space");
  await expect.poll(async () => (await poster(page)).svg).toBe(captured.svg);
  expect(await page.evaluate(() => (Reflect.get(window, "finishPoolImages") as unknown[]).length)).toBe(2);
  expect(page.url()).toBe(blankUrl);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await preview(page).getByRole("button", { name: "Close pool match infographic", exact: true }).click();
  await expect(card(page, 7).locator(".result-preview strong")).toHaveCount(0);
  await expect(undo(page)).toBeDisabled();
  await expect(page.getByRole("button", { name: "Redo prediction action", exact: true })).toBeEnabled();
  await openPoster(page, "South Africa");
  await expect(showPredictions(page)).toBeChecked();
  await page.keyboard.press("Escape");
});

test("closing a pending team image cannot replace a later team's preview", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let pending = 0;
  await page.route("**/flags/4x3/za.svg", async (route) => {
    if (route.request().resourceType() === "image") { await route.continue(); return; }
    pending++;
    await gate;
    await route.continue().catch(() => undefined);
  });
  try {
    await page.goto("/");
    await selectTeam(page, "za");
    const originalUrl = page.url();
    await openPoster(page, "South Africa");
    await expect.poll(() => pending).toBeGreaterThan(0);
    await expect(preview(page).getByRole("button", { name: "Download PNG", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(preview(page)).toHaveCount(0);
    await selectTeam(page, "nz");
    await openPoster(page, "New Zealand");
    const current = await poster(page);
    expect(current.rows.map((row) => row.id)).toEqual(["match-3", "match-16", "match-25"]);
    release();
    await expect(preview(page).getByRole("button", { name: "Download PNG", exact: true })).toBeEnabled();
    expect((await poster(page)).svg).toBe(current.svg);
    await expect(preview(page).getByRole("heading", { name: "New Zealand", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(focus(page)).toHaveAttribute("data-team-id", "nz");
    expect(page.url()).toBe(originalUrl);
    await expect(undo(page)).toBeDisabled();
  } finally { release(); }
});

test("pool kickoff times use the visitor's explicit local timezone", async ({ browser, baseURL }) => {
  const times: Record<string, string> = {};
  for (const timezoneId of ["UTC", "Africa/Johannesburg"]) {
    const context = await browser.newContext({ baseURL, timezoneId, locale: "en-GB" });
    try {
      const page = await context.newPage();
      await page.route("**/api/shares?fingerprint=*", (route) => route.fulfill({ status: 404, json: { error: "Prediction link not found." } }));
      await page.clock.setFixedTime(new Date("2026-10-06T23:00:00Z"));
      await page.goto("/");
      await selectTeam(page, "za");
      await openPoster(page, "South Africa");
      const artifact = await poster(page);
      times[timezoneId] = artifact.rows[0].text;
      expect(artifact.text).toContain(timezoneId);
    } finally { await context.close(); }
  }
  expect(times.UTC).toContain("03:45");
  expect(times["Africa/Johannesburg"]).toContain("05:45");
  expect(times.UTC).not.toBe(times["Africa/Johannesburg"]);
});

test("PNG failure offers a self-contained SVG download without breaking mobile editing or undo", async ({ page }) => {
  const errors: string[] = [];
  const uploads: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/posters") uploads.push(request.url());
  });
  await page.setViewportSize({ width: 320, height: 812 });
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.toBlob = function (callback) { callback(null); };
    Reflect.set(HTMLDialogElement.prototype, "showModal", undefined);
    Reflect.set(window, "ClipboardItem", undefined);
  });
  await page.goto("/");
  const blankUrl = page.url();
  await selectTeam(page, "za");
  await card(page, 7).getByRole("button", { name: "South Africa", exact: true }).click();
  const pickedUrl = page.url();
  await openPoster(page, "South Africa");
  const fallback = preview(page).getByRole("button", { name: "Download SVG", exact: true });
  await expect(fallback).toBeEnabled();
  await expect(preview(page).getByRole("button", { name: "Download PNG", exact: true })).toHaveCount(0);
  await expect(preview(page).getByRole("status").filter({ hasText: "Your browser can save this image as SVG." })).toBeVisible();
  const captured = await poster(page);
  expect(captured.rows.map((row) => row.venue)).toEqual(southAfricaVenues);
  expect(captured.rows[0].text).toContain("24 – 17");
  await showPredictions(page).click();
  await expect(showPredictions(page)).not.toBeChecked();
  await expect.poll(async () => (await poster(page)).rows.some((row) => /\bPREDICTIONS?\b|\bPICK\b/i.test(row.text))).toBe(false);
  await expect(fallback).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const bounds = await preview(page).boundingBox();
  expect(bounds?.width).toBeLessThanOrEqual(320);
  const waiting = page.waitForEvent("download");
  await fallback.click();
  const download = await waiting;
  expect(download.suggestedFilename()).toMatch(/south-africa.*\.svg$/);
  const bytes = await downloaded(download);
  const artifact = await poster(page);
  expect(bytes.toString("utf8")).toBe(artifact.svg);
  expect(artifact.rows.map((row) => row.id)).toEqual(["match-7", "match-21", "match-36"]);
  expect(artifact.rows.map((row) => row.venue)).toEqual(southAfricaVenues);
  expect(artifact.rows.every((row) => /\bVS\b/.test(row.text))).toBe(true);
  expect(artifact.flags.every((flag) => flag.startsWith("data:image/svg+xml;base64,"))).toBe(true);
  await showPredictions(page).focus();
  await page.keyboard.press("Tab");
  await expect(preview(page).getByRole("button", { name: "Copy share link", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(fallback).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(preview(page).getByRole("button", { name: "Close pool match infographic", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(showPredictions(page)).toBeFocused();
  await showPredictions(page).click();
  await expect(showPredictions(page)).toBeChecked();
  await expect.poll(async () => (await poster(page)).svg).toBe(captured.svg);
  await expect(fallback).toBeEnabled();
  const restoredWaiting = page.waitForEvent("download");
  await fallback.click();
  expect((await downloaded(await restoredWaiting)).toString("utf8")).toBe(captured.svg);
  await preview(page).getByRole("button", { name: "Copy share link", exact: true }).click();
  await expect(preview(page).getByRole("status").filter({ hasText: "Permanent link unavailable." })).toBeVisible();
  const manual = preview(page).getByRole("textbox", { name: "Share link", exact: true });
  await expect(manual).toBeFocused();
  const destination = new URL(await manual.inputValue());
  expect(destination.searchParams.get("focus")).toBe("za");
  expect(destination.hash).toBe(new URL(pickedUrl).hash);
  expect(uploads).toEqual([]);
  expect(errors).toEqual([]);
  await page.keyboard.press("Escape");
  expect(page.url()).toBe(pickedUrl);
  await expect(undo(page)).toBeEnabled();
  await undo(page).click();
  expect(page.url()).toBe(blankUrl);
  await expect(undo(page)).toBeDisabled();
  await expect(card(page, 7).locator(".result-preview strong")).toHaveCount(0);
});
