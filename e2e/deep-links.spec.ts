import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createHash } from "node:crypto";

const card = (page: Page, id: number) => page.locator(`[data-fixture-id="${id}"]`);
const dialog = (page: Page) => page.getByRole("dialog");
const undo = (page: Page) => page.getByRole("button", { name: "Undo last prediction action" });
const redo = (page: Page) => page.getByRole("button", { name: "Redo prediction action" });
const tokenIn = (url: string) => new URL(url).hash.slice("#predictions=".length);
const lookupPattern = /\/api\/shares\?fingerprint=/;

async function missLookups(page: Page): Promise<void> {
  await page.route(lookupPattern, (route) => route.fulfill({
    status: 404, contentType: "application/json", body: '{"error":"Prediction link not found."}',
  }));
}

async function expectMatch(page: Page, id: number): Promise<void> {
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toHaveAttribute("id", `match-${id}-details-dialog`);
  expect(new URL(page.url()).searchParams.get("match")).toBe(String(id));
}

async function advanced(page: Page): Promise<void> {
  await dialog(page).getByText("Exact scores & bonus points", { exact: true }).click();
}

async function done(page: Page): Promise<void> {
  await dialog(page).getByRole("button", { name: "Done", exact: true }).click();
  await expect(dialog(page)).not.toBeVisible();
  expect(new URL(page.url()).searchParams.has("match")).toBe(false);
}

async function save(request: APIRequestContext, token: string): Promise<{ alias: string; token: string }> {
  const response = await request.post("/api/shares", { data: { token } });
  expect(response.status()).toBe(200);
  const stored = await response.json() as { alias: string; token: string };
  expect(stored.alias).toMatch(/^[a-z]+\.[a-z]+\.[a-z]+$/);
  expect(stored.token).toMatch(/^v3\.[A-Za-z0-9_-]+$/);
  return stored;
}

async function navigateMatch(page: Page, id?: number): Promise<void> {
  await page.evaluate((match) => {
    const next = new URL(location.href);
    if (match === undefined) next.searchParams.delete("match");
    else next.searchParams.set("match", String(match));
    history.pushState(null, "", next);
    dispatchEvent(new PopStateEvent("popstate"));
  }, id);
}

test("an empty mobile match link opens directly, copies without saving, and closes without prediction history", async ({ page, context, browser }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const writes: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/shares") writes.push(request.method());
  });
  await page.goto("/?ref=fixture&match=25");
  await expectMatch(page, 25);
  const originalUrl = page.url();
  const historyLength = await page.evaluate(() => history.length);
  await expect(dialog(page).getByRole("button", { name: "New Zealand", exact: true })).toBeFocused();
  await expect(dialog(page).getByRole("button", { name: "Clear pick", exact: true })).toBeDisabled();
  await expect(undo(page)).toBeDisabled();
  const copy = dialog(page).getByRole("button", { name: "Copy match link", exact: true });
  const bounds = await copy.boundingBox();
  expect(bounds?.width).toBeGreaterThanOrEqual(44);
  expect(bounds?.height).toBeGreaterThanOrEqual(44);
  await copy.click();
  await expect(dialog(page).getByRole("status").filter({ hasText: "Link copied" })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(originalUrl);
  expect(new URL(copied).hash).toBe("");
  expect(writes).toEqual([]);
  const fresh = await browser.newContext();
  const shared = await fresh.newPage();
  await shared.goto(copied);
  await expectMatch(shared, 25);
  await expect(undo(shared)).toBeDisabled();
  await done(shared);
  await fresh.close();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.keyboard.press("Escape");
  await expect(dialog(page)).not.toBeVisible();
  expect(new URL(page.url()).search).toBe("?ref=fixture");
  await expect(card(page, 25).locator(".details-toggle")).toBeFocused();
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await expect(undo(page)).toBeDisabled();
});

test("focused edits stay one undo action and Done, Escape, backdrop and Clear pick remove the match focus", async ({ page }) => {
  await missLookups(page);
  await page.goto("/?ref=fixture&match=1#predictions=v3.AYIKQA");
  await expectMatch(page, 1);
  const historyLength = await page.evaluate(() => history.length);
  await advanced(page);
  await dialog(page).locator("#match-1-margin").fill("18");
  await dialog(page).locator("#match-1-homeScore").fill("35");
  await dialog(page).locator("#match-1-homeTries").fill("4");
  await expectMatch(page, 1);
  const editedToken = tokenIn(page.url());
  expect(editedToken).not.toBe("v3.AYIKQA");
  await done(page);
  expect(new URL(page.url()).search).toBe("?ref=fixture");
  await undo(page).click();
  expect(tokenIn(page.url())).toBe("v3.AYIKQA");
  await expect(undo(page)).toBeDisabled();
  await redo(page).click();
  expect(tokenIn(page.url())).toBe(editedToken);
  await card(page, 1).locator(".details-toggle").click();
  await expectMatch(page, 1);
  await page.keyboard.press("Escape");
  await expect(dialog(page)).not.toBeVisible();
  await expect(card(page, 1).locator(".details-toggle")).toBeFocused();
  expect(new URL(page.url()).searchParams.has("match")).toBe(false);
  expect(tokenIn(page.url())).toBe(editedToken);
  await card(page, 1).locator(".details-toggle").click();
  await expectMatch(page, 1);
  const box = await dialog(page).boundingBox();
  if (!box || box.x < 2) throw new Error("The desktop dialog must leave a clickable backdrop.");
  await page.mouse.click(box.x / 2, box.y + Math.min(box.height / 2, 200));
  await expect(dialog(page)).not.toBeVisible();
  expect(new URL(page.url()).searchParams.has("match")).toBe(false);
  expect(tokenIn(page.url())).toBe(editedToken);
  await card(page, 1).locator(".details-toggle").click();
  await advanced(page);
  await dialog(page).locator("#match-1-margin").fill("19");
  const beforeClear = tokenIn(page.url());
  await dialog(page).getByRole("button", { name: "Clear pick", exact: true }).click();
  await expect(dialog(page)).not.toBeVisible();
  expect(new URL(page.url()).searchParams.has("match")).toBe(false);
  expect(new URL(page.url()).hash).toBe("");
  await undo(page).click();
  expect(tokenIn(page.url())).toBe(beforeClear);
  await expect(dialog(page)).not.toBeVisible();
  await undo(page).click();
  expect(tokenIn(page.url())).toBe(editedToken);
  await undo(page).click();
  expect(tokenIn(page.url())).toBe("v3.AYIKQA");
  await expect(undo(page)).toBeDisabled();
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
});

test("Copy match link shares the focused game in a fresh browser and reuses one alias for different game destinations", async ({ page, context, browser, request }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await missLookups(page);
  let posts = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/shares" && request.method() === "POST") posts++;
  });
  await page.goto("/");
  await card(page, 1).getByRole("button", { name: "Australia", exact: true }).click();
  const token = tokenIn(page.url());
  const historyLength = await page.evaluate(() => history.length);
  await card(page, 1).locator(".details-toggle").click();
  await dialog(page).getByRole("button", { name: "Copy match link", exact: true }).click();
  await expect(dialog(page).getByRole("status").filter({ hasText: "Link copied" })).toBeVisible();
  const firstLink = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(firstLink).pathname).toMatch(/^\/s\/[a-z]+\.[a-z]+\.[a-z]+$/);
  expect(new URL(firstLink).search).toBe("?match=1");
  expect(new URL(firstLink).hash).toBe("");
  await expect(page).toHaveURL(firstLink);
  await expectMatch(page, 1);
  const record = await request.get(`/api/shares/${new URL(firstLink).pathname.slice("/s/".length)}`);
  expect((await record.json()).token).toBe(token);
  const fresh = await browser.newContext();
  const shared = await fresh.newPage();
  await shared.goto(firstLink);
  await expectMatch(shared, 1);
  await expect(shared).toHaveURL(firstLink);
  await expect(dialog(shared).locator(".match-dialog-preview strong")).toHaveText("24 – 17");
  await expect(undo(shared)).toBeDisabled();
  await done(shared);
  await done(page);
  await card(page, 2).locator(".details-toggle").click();
  await dialog(page).getByRole("button", { name: "Copy match link", exact: true }).click();
  await expect(dialog(page).getByRole("status").filter({ hasText: "Link copied" })).toBeVisible();
  const secondLink = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(secondLink).pathname).toBe(new URL(firstLink).pathname);
  expect(new URL(secondLink).search).toBe("?match=2");
  expect(posts).toBe(1);
  await shared.goto(secondLink);
  await expectMatch(shared, 2);
  await expect(shared).toHaveURL(secondLink);
  await expect(dialog(shared).getByRole("button", { name: "Clear pick", exact: true })).toBeDisabled();
  await done(shared);
  await expect(card(shared, 1).getByRole("button", { name: "Australia", exact: true })).toHaveAttribute("aria-pressed", "true");
  await fresh.close();
  await done(page);
  await undo(page).click();
  expect(new URL(page.url()).hash).toBe("");
  await expect(undo(page)).toBeDisabled();
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
});

test("failed clipboard access exposes a selectable match link inside the modal", async ({ page, browser }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      write: async () => { throw new Error("Clipboard denied"); },
      writeText: async () => { throw new Error("Clipboard denied"); },
    } });
    document.execCommand = () => false;
  });
  await page.goto("/?match=25&ref=manual");
  await expectMatch(page, 25);
  const link = page.url();
  await dialog(page).getByRole("button", { name: "Copy match link", exact: true }).click();
  await expect(dialog(page).getByRole("status").filter({ hasText: "Select the link below to copy it." })).toBeVisible();
  const manual = dialog(page).getByRole("textbox", { name: "Your match link" });
  await expect(manual).toBeVisible();
  await expect(manual).toHaveValue(link);
  await expect(manual).toHaveAttribute("readonly", "");
  await manual.focus();
  await expect(manual).toBeFocused();
  expect(await manual.evaluate((element: HTMLInputElement) => element.selectionEnd! - element.selectionStart!)).toBe(link.length);
  const fresh = await browser.newContext();
  const shared = await fresh.newPage();
  await shared.goto(await manual.inputValue());
  await expectMatch(shared, 25);
  await expect(undo(shared)).toBeDisabled();
  await fresh.close();
  await page.keyboard.press("Escape");
  expect(new URL(page.url()).search).toBe("?ref=manual");
  await expect(undo(page)).toBeDisabled();
});

test("legacy slash, v1 and canonical short links retain the addressed 2023 game", async ({ page, browser, request, baseURL }) => {
  await missLookups(page);
  const legacy = Buffer.from([48, 1, 0, 0, 0, 0, 0, 255, 255, 255]).toString("base64");
  const v1 = Buffer.from([1, 1, 31, 9, 10, 1, 2]).toString("base64url");
  for (const fixture of [
    { path: `/${legacy}?match=1&ref=legacy`, home: "255", away: "255" },
    { path: `/?match=1&ref=legacy#predictions=v1.rwc2023.fixtures-v1.${v1}`, home: "9", away: "10" },
  ]) {
    await page.goto(fixture.path);
    const originalUrl = page.url();
    await expect(page.locator(".eyebrow")).toHaveText("Legacy 2023 tournament");
    await expectMatch(page, 1);
    await advanced(page);
    await expect(dialog(page).locator("#match-1-homeScore")).toHaveValue(fixture.home);
    await expect(dialog(page).locator("#match-1-awayScore")).toHaveValue(fixture.away);
    await expect(undo(page)).toBeDisabled();
    expect(page.url()).toBe(originalUrl);
    await done(page);
    expect(new URL(page.url()).search).toBe("?ref=legacy");
  }
  const stored = await save(request, legacy);
  const shortUrl = new URL(`/s/${stored.alias}?match=1&ref=legacy`, baseURL).href;
  const fresh = await browser.newContext();
  const shared = await fresh.newPage();
  await shared.goto(shortUrl);
  await expectMatch(shared, 1);
  await expect(shared).toHaveURL(shortUrl);
  await expect(shared.locator(".eyebrow")).toHaveText("Legacy 2023 tournament");
  await advanced(shared);
  await expect(dialog(shared).locator("#match-1-homeScore")).toHaveValue("255");
  await expect(dialog(shared).locator("#match-1-awayScore")).toHaveValue("255");
  await fresh.close();
});

test("invalid match queries ignore focus and malformed prediction links still block details", async ({ page }) => {
  await missLookups(page);
  for (const query of ["match=", "match=0", "match=-1", "match=01", "match=1.0", "match=word", "match=53", "match=1&match=2"]) {
    await page.goto(`/?${query}#predictions=v3.AYIKQA`);
    const originalUrl = page.url();
    await expect(card(page, 1).getByRole("button", { name: "Australia", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(page.url()).toBe(originalUrl);
    await expect(undo(page)).toBeDisabled();
  }
  const v1 = Buffer.from([1, 1, 31, 9, 10, 1, 2]).toString("base64url");
  await page.goto(`/?match=49#predictions=v1.rwc2023.fixtures-v1.${v1}`);
  const legacyUrl = page.url();
  await expect(page.locator(".eyebrow")).toHaveText("Legacy 2023 tournament");
  await expect(dialog(page)).toHaveCount(0);
  expect(page.url()).toBe(legacyUrl);
  await page.goto("/?match=1#predictions=v9.rwc2027.future.AA");
  const malformed = page.url();
  await expect(page.getByRole("alert")).toContainText("unsupported version");
  await expect(dialog(page)).toHaveCount(0);
  await expect(card(page, 1).locator(".details-toggle")).toBeDisabled();
  expect(page.url()).toBe(malformed);
});

test("read-only alias discovery preserves match focus, dialog identity, invalid input and keyboard focus", async ({ page, request, baseURL }) => {
  const stored = await save(request, "v3.AYIKQA");
  const fingerprint = createHash("sha256").update(stored.token).digest("hex");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let reads = 0;
  let posts = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/shares" && request.method() === "POST") posts++;
  });
  await page.route(lookupPattern, async (route) => {
    expect(new URL(route.request().url()).searchParams.get("fingerprint")).toBe(fingerprint);
    reads++;
    await gate;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(stored) });
  });
  await page.goto(`/?match=1&ref=lookup#predictions=${stored.token}`);
  await expectMatch(page, 1);
  const historyLength = await page.evaluate(() => history.length);
  await expect.poll(() => reads).toBe(1);
  await advanced(page);
  await dialog(page).evaluate((element) => { element.setAttribute("data-preserved-dialog", "before-lookup"); });
  const score = dialog(page).locator("#match-1-homeScore");
  await score.fill("256");
  await expect(score).toBeFocused();
  await expect(score).toHaveAttribute("aria-invalid", "true");
  release();
  const shortUrl = new URL(`/s/${stored.alias}?match=1&ref=lookup`, baseURL).href;
  await expect(page).toHaveURL(shortUrl);
  await expectMatch(page, 1);
  await expect(dialog(page)).toHaveAttribute("data-preserved-dialog", "before-lookup");
  await expect(dialog(page).locator(".detail-advanced")).toHaveAttribute("open", "");
  await expect(score).toHaveValue("256");
  await expect(score).toBeFocused();
  await expect(score).toHaveAttribute("aria-invalid", "true");
  expect(posts).toBe(0);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await score.fill("");
  await done(page);
  await expect(undo(page)).toBeDisabled();
  expect(new URL(page.url()).pathname).toBe(`/s/${stored.alias}`);
  expect(new URL(page.url()).search).toBe("?ref=lookup");
});

test("match-only Back and Forward opens and closes details while retaining undo and separating edit sessions", async ({ page }) => {
  await missLookups(page);
  await page.goto("/");
  await card(page, 1).getByRole("button", { name: "Australia", exact: true }).click();
  await card(page, 1).locator(".details-toggle").click();
  await advanced(page);
  await dialog(page).locator("#match-1-homeScore").fill("30");
  const firstEdit = tokenIn(page.url());
  await navigateMatch(page, 2);
  await expectMatch(page, 2);
  expect(tokenIn(page.url())).toBe(firstEdit);
  await expect(undo(page)).toBeEnabled();
  await page.goBack();
  await expectMatch(page, 1);
  await advanced(page);
  await expect(dialog(page).locator("#match-1-homeScore")).toHaveValue("30");
  await expect(undo(page)).toBeEnabled();
  await page.goForward();
  await expectMatch(page, 2);
  await navigateMatch(page);
  await expect(dialog(page)).not.toBeVisible();
  await expect(undo(page)).toBeEnabled();
  await page.goBack();
  await expectMatch(page, 2);
  await page.goForward();
  await expect(dialog(page)).not.toBeVisible();
  expect(tokenIn(page.url())).toBe(firstEdit);
  await navigateMatch(page, 1);
  await expectMatch(page, 1);
  await advanced(page);
  await dialog(page).locator("#match-1-homeScore").fill("31");
  const secondEdit = tokenIn(page.url());
  expect(secondEdit).not.toBe(firstEdit);
  await done(page);
  await undo(page).click();
  expect(tokenIn(page.url())).toBe(firstEdit);
  await undo(page).click();
  expect(tokenIn(page.url())).toBe("v3.AYIKQA");
  await undo(page).click();
  expect(new URL(page.url()).hash).toBe("");
  await expect(undo(page)).toBeDisabled();
});

test("knockout deep links select the ready stage and preserve query redirects while unresolved and dormant games stay read-only", async ({ page, request, baseURL }) => {
  await missLookups(page);
  await page.goto("/?match=37");
  await expectMatch(page, 37);
  await expect(dialog(page).getByRole("status").filter({ hasText: "Waiting on earlier picks" })).toBeVisible();
  await expect(dialog(page).locator(".detail-fields")).toHaveAttribute("disabled", "");
  await expect(dialog(page).locator(".detail-winner-options button").first()).toBeDisabled();
  await expect(dialog(page).locator("#match-37-homeScore")).toBeDisabled();
  await expect(dialog(page).getByRole("button", { name: "Clear pick", exact: true })).toBeDisabled();
  await expect(undo(page)).toBeDisabled();
  await done(page);
  await page.getByRole("button", { name: "Fill unpicked matches", exact: true }).click();
  const token = tokenIn(page.url());
  await page.getByRole("button", { name: /\bKnockout\b/ }).click();
  const finalSummary = await card(page, 52).locator(".result-preview").innerText();
  await page.goto(`/?match=52&ref=final#predictions=${token}`);
  await expectMatch(page, 52);
  await expect(page.getByRole("button", { name: /\bKnockout\b/ })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog(page).locator(".detail-fields")).not.toHaveAttribute("disabled", "");
  await expect(dialog(page).locator(".detail-winner-options button").first()).toBeEnabled();
  await expect(dialog(page).getByRole("button", { name: "Clear pick", exact: true })).toBeEnabled();
  await expect(card(page, 52).locator(".result-preview")).toHaveText(finalSummary, { useInnerText: true });
  const stored = await save(request, token);
  const shortPath = `/s/${stored.alias}?match=52&ref=final`;
  for (const method of ["GET", "HEAD"]) {
    const response = await request.fetch(shortPath, { method, maxRedirects: 0 });
    expect(response.status()).toBe(302);
    const target = new URL(response.headers().location, baseURL);
    expect(target.pathname).toBe("/");
    expect(target.search).toBe("?match=52&ref=final");
    expect(target.hash).toBe(`#predictions=${token}`);
    if (method === "HEAD") expect(await response.body()).toHaveLength(0);
  }
  await page.goto(shortPath);
  await expectMatch(page, 52);
  await expect(page.getByRole("button", { name: /\bKnockout\b/ })).toHaveAttribute("aria-pressed", "true");
  await done(page);
  await page.getByRole("button", { name: /\bPools\b/ }).click();
  await card(page, 1).locator(".details-toggle").click();
  await advanced(page);
  await dialog(page).locator("#match-1-homeScore").fill("0");
  await dialog(page).locator("#match-1-awayScore").fill("10");
  await done(page);
  await expect(card(page, 1).locator(".fixture-issues")).toBeVisible();
  const dormantToken = tokenIn(page.url());
  await page.goto(`/?match=37#predictions=${dormantToken}`);
  await expectMatch(page, 37);
  await expect(dialog(page).getByRole("status").filter({ hasText: "Waiting on earlier picks" })).toBeVisible();
  await expect(dialog(page).locator(".detail-fields")).toHaveAttribute("disabled", "");
  await expect(dialog(page).locator(".detail-winner-options button").first()).toBeDisabled();
  await expect(dialog(page).locator("#match-37-homeScore")).toBeDisabled();
  await expect(dialog(page).getByRole("button", { name: "Clear pick", exact: true })).toBeDisabled();
  await expect(dialog(page).getByRole("button", { name: "Close match details", exact: true })).toBeFocused();
  await expect(page.getByRole("button", { name: /\bPools\b/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(tokenIn(page.url())).toBe(dormantToken);
  await done(page);
  expect(tokenIn(page.url())).toBe(dormantToken);
  await expect(undo(page)).toBeDisabled();
});
