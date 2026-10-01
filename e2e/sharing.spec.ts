import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createHash } from "node:crypto";

const card = (page: Page, id: number) => page.locator(`[data-fixture-id="${id}"]`);
const copy = (page: Page) => page.getByRole("button", { name: "Copy link", exact: true });
const undo = (page: Page) => page.getByRole("button", { name: "Undo last prediction action" });
const tokenIn = (url: string) => new URL(url).hash.slice("#predictions=".length);
const sharePath = (alias: string) => `/s/${alias}`;
const aliasPattern = /^[a-z]+\.[a-z]+\.[a-z]+$/;
const lookupPattern = /\/api\/shares\?fingerprint=/;
const fingerprint = (token: string) => createHash("sha256").update(token).digest("hex");

async function missLookups(page: Page): Promise<void> {
  await page.route(lookupPattern, (route) => route.fulfill({
    status: 404, contentType: "application/json", body: '{"error":"Prediction link not found."}',
  }));
}

async function save(request: APIRequestContext, token: string): Promise<{ alias: string; token: string }> {
  const response = await request.post("/api/shares", { data: { token } });
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/^application\/json(?:;|$)/);
  const stored = await response.json() as { alias: string; token: string };
  expect(stored.alias).toMatch(aliasPattern);
  expect(stored.alias.length).toBeLessThan(64);
  expect(stored.token).toMatch(/^v3\.[A-Za-z0-9_-]+$/);
  if (token.startsWith("v3.")) expect(stored.token).toBe(token);
  return stored;
}

async function captureClipboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Reflect.set(window, "copiedPredictionLink", "");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async (value: string) => { Reflect.set(window, "copiedPredictionLink", value); },
    } });
  });
}

async function captureDeferredClipboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Reflect.set(window, "copiedPredictionLink", "");
    Reflect.set(window, "clipboardWriteCount", 0);
    Reflect.set(window, "clipboardWriteTextCount", 0);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      write: async (items: ClipboardItem[]) => {
        // Observe invocation before resolving the promised ClipboardItem data.
        Reflect.set(window, "clipboardWriteCount", Number(Reflect.get(window, "clipboardWriteCount")) + 1);
        Reflect.set(window, "clipboardWriteTypes", items[0].types);
        Reflect.set(window, "clipboardWriteActivated", navigator.userActivation.isActive);
        const blob = await items[0].getType("text/plain");
        Reflect.set(window, "copiedPredictionLink", await blob.text());
      },
      writeText: async (value: string) => {
        Reflect.set(window, "clipboardWriteTextCount", Number(Reflect.get(window, "clipboardWriteTextCount")) + 1);
        Reflect.set(window, "copiedPredictionLink", value);
      },
    } });
  });
}

async function copiedLink(page: Page): Promise<string> {
  await expect.poll(() => page.evaluate(() => String(Reflect.get(window, "copiedPredictionLink")))).not.toBe("");
  return page.evaluate(() => String(Reflect.get(window, "copiedPredictionLink")));
}

test("share storage deduplicates canonical snapshots and preserves earlier aliases across later edits", async ({ request, page, baseURL }) => {
  const first = await save(request, "v3.AYIKQA");
  const repeated = await save(request, "v3.AYIKQA");
  expect(repeated).toEqual(first);
  const originalV2 = "v2.rwc2027.fixtures-2026-02.AE4ARItWKijKL8sszszPS8zRLTNU0lFKSU1LLM0pKQbzoqMNdQx1opUy8nNTlWJ18kpzcnSijUx0DM11jHWMdCDiYOFYIAAA";
  expect(await save(request, originalV2)).toEqual(first);
  await page.goto("/");
  await card(page, 1).getByRole("button", { name: "Hong Kong China", exact: true }).click();
  const second = await save(request, tokenIn(page.url()));
  expect(second.alias).not.toBe(first.alias);
  for (const stored of [first, second]) {
    const record = await request.get(`/api/shares/${stored.alias}`);
    expect(record.status()).toBe(200);
    expect(await record.json()).toEqual(stored);
    const byFingerprint = await request.get(`/api/shares?fingerprint=${fingerprint(stored.token)}`);
    expect(byFingerprint.status()).toBe(200);
    expect(await byFingerprint.json()).toEqual(stored);
    for (const method of ["GET", "HEAD"]) {
      const response = await request.fetch(sharePath(stored.alias), { method, maxRedirects: 0 });
      expect(response.status()).toBe(302);
      const target = new URL(response.headers().location, baseURL);
      expect(target.origin).toBe(new URL(baseURL!).origin);
      expect(target.pathname).toBe("/");
      expect(target.hash).toBe(`#predictions=${stored.token}`);
      if (method === "HEAD") expect(await response.body()).toHaveLength(0);
    }
  }
});

test("sharing endpoints reject malformed and oversized input and missing aliases without serving the app shell", async ({ request }) => {
  for (const body of ["{", "null", "[]", "{}", '{"token":1}', '{"token":"v9.future"}',
    '{"token":"https://example.com/"}', '{"token":"v3.AYIKQA","extra":true}']) {
    const response = await request.post("/api/shares", { data: body, headers: { "Content-Type": "application/json" } });
    expect(response.status(), body).toBe(400);
    expect(response.headers()["content-type"]).toMatch(/^application\/json(?:;|$)/);
    expect((await response.body()).length).toBeLessThan(1024);
  }
  const oversized = await request.post("/api/shares", {
    data: JSON.stringify({ token: "a".repeat(20000) }), headers: { "Content-Type": "application/json" },
  });
  expect(oversized.status()).toBe(413);
  expect((await oversized.body()).length).toBeLessThan(1024);
  const oversizedToken = await request.post("/api/shares", { data: { token: "a".repeat(12001) } });
  expect(oversizedToken.status()).toBe(413);
  expect((await oversizedToken.body()).length).toBeLessThan(1024);
  const unsupported = await request.post("/api/shares", { data: "v3.AYIKQA", headers: { "Content-Type": "text/plain" } });
  expect(unsupported.status()).toBe(415);
  for (const path of ["/api/shares", "/api/shares/not-a-share", "/s/not-a-share", "/s/absent.absent.absent"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(path === "/api/shares" ? 400 : 404);
    expect(response.headers().location).toBeUndefined();
    if (path.startsWith("/api/")) expect(response.headers()["content-type"]).toMatch(/^application\/json(?:;|$)/);
    const body = await response.text();
    expect(body).not.toContain('id="root"');
    expect(body.length).toBeLessThan(1024);
  }
  const missingHead = await request.head("/s/absent.absent.absent", { maxRedirects: 0 });
  expect(missingHead.status()).toBe(404);
  expect(await missingHead.body()).toHaveLength(0);
  const wrongMethod = await request.post("/s/absent.absent.absent", { data: {} });
  expect(wrongMethod.status()).toBe(405);
  for (const query of ["fingerprint=bad", `fingerprint=${"A".repeat(64)}`,
    `fingerprint=${"a".repeat(64)}&fingerprint=${"a".repeat(64)}`, `fingerprint=${"a".repeat(64)}&extra=1`]) {
    const response = await request.get(`/api/shares?${query}`);
    expect(response.status()).toBe(400);
    expect((await response.body()).length).toBeLessThan(1024);
  }
  // No accepted snapshot can have this fingerprint: inputs are canonical v3,
  // while the hashed string is deliberately not a prediction token.
  const absent = fingerprint("not a prediction token");
  for (const method of ["GET", "HEAD", "GET"]) {
    const response = await request.fetch(`/api/shares?fingerprint=${absent}`, { method });
    expect(response.status()).toBe(404);
    expect(response.headers()["cache-control"]).toMatch(/no-store/);
    if (method === "HEAD") expect(await response.body()).toHaveLength(0);
  }
});

test("copy starts the activated clipboard write before saving, captures its clicked snapshot and reuses the alias offline", async ({ page, context, browser, request }) => {
  await captureDeferredClipboard(page);
  await missLookups(page);
  await page.goto("/");
  await card(page, 1).getByRole("button", { name: "Australia", exact: true }).click();
  const clickedUrl = page.url();
  const historyLength = await page.evaluate(() => history.length);
  let releaseRequest!: () => void;
  const gate = new Promise<void>((resolve) => { releaseRequest = resolve; });
  let receivedToken = "";
  let writes = 0;
  await page.route("**/api/shares", async (route) => {
    writes++;
    receivedToken = (route.request().postDataJSON() as { token: string }).token;
    await gate;
    await route.fulfill({ response: await route.fetch() });
  });
  await copy(page).click();
  await expect.poll(() => receivedToken).toBe(tokenIn(clickedUrl));
  await expect.poll(() => page.evaluate(() => Reflect.get(window, "clipboardWriteCount"))).toBe(1);
  expect(await page.evaluate(() => Reflect.get(window, "clipboardWriteTypes"))).toEqual(["text/plain"]);
  expect(await page.evaluate(() => Reflect.get(window, "clipboardWriteActivated"))).toBe(true);
  expect(await page.evaluate(() => Reflect.get(window, "clipboardWriteTextCount"))).toBe(0);
  expect(await page.evaluate(() => Reflect.get(window, "copiedPredictionLink"))).toBe("");
  await expect(copy(page)).toBeDisabled();
  await card(page, 1).getByRole("button", { name: "Hong Kong China", exact: true }).click();
  const changedUrl = page.url();
  expect(changedUrl).not.toBe(clickedUrl);
  await expect(card(page, 1).getByRole("button", { name: "Hong Kong China", exact: true })).toHaveAttribute("aria-pressed", "true");
  releaseRequest();
  const link = await copiedLink(page);
  expect(new URL(link).pathname).toMatch(/^\/s\/[a-z]+\.[a-z]+\.[a-z]+$/);
  expect(page.url()).toBe(changedUrl);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  const fresh = await browser.newContext();
  const shared = await fresh.newPage();
  await shared.goto(link);
  await expect(shared).toHaveURL(link);
  await expect(card(shared, 1).getByRole("button", { name: "Australia", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(undo(shared)).toBeDisabled();
  await fresh.close();
  await undo(page).click();
  expect(page.url()).toBe(link);
  await context.setOffline(true);
  await copy(page).click();
  await expect(page.getByRole("status").filter({ hasText: "Link copied" })).toBeVisible();
  expect(await copiedLink(page)).toBe(link);
  expect(await page.evaluate(() => Reflect.get(window, "clipboardWriteCount"))).toBe(2);
  expect(writes).toBe(1);
  await context.setOffline(false);
  const record = await request.get(`/api/shares/${new URL(link).pathname.slice("/s/".length)}`);
  expect((await record.json()).token).toBe(tokenIn(clickedUrl));
});

test("a short link replays conflicts, explicit zero and false, custom engine pins and dormant bracket choices in a fresh browser", async ({ page, browser, request }) => {
  await captureClipboard(page);
  await missLookups(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Fill unpicked matches", exact: true }).click();
  await expect(page.getByRole("button", { name: /\bKnockout\b/ })).toContainText("16/16");
  await page.getByRole("button", { name: /\bKnockout\b/ }).click();
  const finalSummary = await card(page, 52).locator(".result-preview").innerText();
  const finalTeams = await card(page, 52).locator(".winner-choice").allTextContents();
  await page.getByRole("button", { name: /\bPools\b/ }).click();
  await card(page, 2).locator(".details-toggle").click();
  const secondResult = await page.getByRole("dialog").locator(".match-dialog-preview strong").innerText();
  await page.getByRole("dialog").getByRole("button", { name: "Done", exact: true }).click();
  await card(page, 1).locator(".details-toggle").click();
  const originalDetails = page.getByRole("dialog");
  await originalDetails.getByText("Exact scores & bonus points", { exact: true }).click();
  const originalScores = (await originalDetails.locator(".match-dialog-preview strong").innerText()).split(" – ");
  const originalTries = (await originalDetails.locator(".match-dialog-preview > span").innerText()).replace(/ tries$/, "").split(" – ");
  await originalDetails.locator("#match-1-homeScore").fill("0");
  await originalDetails.locator("#match-1-awayScore").fill("10");
  await originalDetails.locator("#match-1-homeTries").fill("0");
  for (const bonus of ["Try bonus", "Losing bonus"]) {
    await originalDetails.getByRole("group", { name: `Australia ${bonus}, match 1`, exact: true })
      .getByRole("button", { name: "No", exact: true }).click();
  }
  await originalDetails.getByRole("button", { name: "Done", exact: true }).click();
  const token = tokenIn(page.url());
  await expect(card(page, 1).locator(".fixture-issues")).toBeVisible();
  await copy(page).click();
  const link = await copiedLink(page);
  await expect(page).toHaveURL(link);
  const record = await request.get(`/api/shares/${new URL(link).pathname.slice("/s/".length)}`);
  expect((await record.json()).token).toBe(token);
  const fresh = await browser.newContext();
  const shared = await fresh.newPage();
  await shared.goto(link);
  await expect(shared).toHaveURL(link);
  await expect(card(shared, 1).locator(".fixture-issues")).toBeVisible();
  await expect(shared.getByRole("button", { name: /\bKnockout\b/ })).toHaveAttribute("aria-disabled", "true");
  await expect(undo(shared)).toBeDisabled();
  await card(shared, 1).locator(".details-toggle").click();
  const dialog = shared.getByRole("dialog");
  await dialog.getByText("Exact scores & bonus points", { exact: true }).click();
  await expect(dialog.locator("#match-1-homeScore")).toHaveValue("0");
  await expect(dialog.locator("#match-1-homeTries")).toHaveValue("0");
  for (const bonus of ["Try bonus", "Losing bonus"]) {
    await expect(dialog.getByRole("group", { name: `Australia ${bonus}, match 1`, exact: true })
      .getByRole("button", { name: "No", exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await card(shared, 2).locator(".details-toggle").click();
  await expect(shared.getByRole("dialog").locator(".match-dialog-preview strong"))
    .toHaveText(secondResult, { useInnerText: true });
  await shared.getByRole("dialog").getByRole("button", { name: "Done", exact: true }).click();
  await card(shared, 1).locator(".details-toggle").click();
  await dialog.getByText("Exact scores & bonus points", { exact: true }).click();
  for (const bonus of ["Try bonus", "Losing bonus"]) {
    await dialog.getByRole("group", { name: `Australia ${bonus}, match 1`, exact: true })
      .getByRole("button", { name: "Auto", exact: true }).click();
  }
  // Keep the contradictory score until the last field, then restore exactly
  // the original outcome so temporarily dormant bracket bindings still match.
  await dialog.locator("#match-1-homeTries").fill(originalTries[0]);
  await dialog.locator("#match-1-awayTries").fill(originalTries[1]);
  await dialog.locator("#match-1-awayScore").fill(originalScores[1]);
  await dialog.locator("#match-1-homeScore").fill(originalScores[0]);
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(shared.getByRole("button", { name: /\bKnockout\b/ })).toContainText("16/16");
  await shared.getByRole("button", { name: /\bKnockout\b/ }).click();
  await expect(card(shared, 52).locator(".result-preview")).toHaveText(finalSummary, { useInnerText: true });
  expect(await card(shared, 52).locator(".winner-choice").allTextContents()).toEqual(finalTeams);
  await undo(shared).click();
  expect(shared.url()).toBe(link);
  await expect(card(shared, 1).locator(".fixture-issues")).toBeVisible();
  await fresh.close();
});

test("service failures and unsafe responses copy the full URL without changing predictions or undo", async ({ page }) => {
  await captureClipboard(page);
  await missLookups(page);
  for (const response of [
    { status: 503, body: '{"error":"Unavailable"}' },
    { status: 200, body: "{" },
    { status: 200, body: '{"alias":"https://example.com","token":"v3.AYIKQA"}' },
    { status: 200, body: '{"alias":"good.safe.words","token":"v3.AYA"}' },
  ]) {
    await page.goto("/");
    await card(page, 1).getByRole("button", { name: "Australia", exact: true }).click();
    const fullUrl = page.url();
    await page.route("**/api/shares", (route) => route.fulfill({ ...response, contentType: "application/json" }));
    await copy(page).click();
    expect(await copiedLink(page)).toBe(fullUrl);
    await expect(page.getByRole("status").filter({ hasText: /full link.*unavailable/i })).toBeVisible();
    expect(page.url()).toBe(fullUrl);
    await undo(page).click();
    expect(new URL(page.url()).hash).toBe("");
    await page.unroute("**/api/shares");
  }
});

test("copying offline falls back promptly while prediction edits and undo keep working", async ({ page, context }) => {
  await captureClipboard(page);
  await missLookups(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await card(page, 1).getByRole("button", { name: "Australia", exact: true }).click();
  const fullUrl = page.url();
  await context.setOffline(true);
  const offlineRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/shares") offlineRequests.push(request.url());
  });
  await copy(page).click();
  expect(await copiedLink(page)).toBe(fullUrl);
  await expect(page.getByRole("status").filter({ hasText: /full link.*unavailable/i })).toBeVisible();
  await expect(copy(page)).toBeEnabled();
  await card(page, 2).locator(".winner-choice").first().click();
  await undo(page).click();
  expect(page.url()).toBe(fullUrl);
  await undo(page).click();
  expect(new URL(page.url()).hash).toBe("");
  expect(offlineRequests).toEqual([]);
  await context.setOffline(false);
});

test("an existing full snapshot becomes its short address through read-only lookup and restores it after refresh", async ({ page, request, baseURL }) => {
  const stored = await save(request, "v3.AYIKQA");
  const shortUrl = new URL(sharePath(stored.alias), baseURL).href;
  const calls: { method: string; fingerprint: string | null }[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/shares") calls.push({ method: request.method(), fingerprint: url.searchParams.get("fingerprint") });
  });
  await page.goto(`/#predictions=${stored.token}`);
  const historyLength = await page.evaluate(() => history.length);
  await expect(card(page, 1).getByRole("button", { name: "Australia", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(shortUrl);
  expect(calls).toEqual([{ method: "GET", fingerprint: fingerprint(stored.token) }]);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await expect(undo(page)).toBeDisabled();
  await page.reload();
  await expect(page).toHaveURL(shortUrl);
  await expect(card(page, 1).getByRole("button", { name: "Australia", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(calls).toEqual(Array.from({ length: 2 }, () => ({ method: "GET", fingerprint: fingerprint(stored.token) })));
  await expect(undo(page)).toBeDisabled();
});

test("missing aliases leave full links editable without creating shares, and malformed links never trigger lookup", async ({ page }) => {
  await missLookups(page);
  const calls: { method: string; fingerprint: string | null }[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/shares") calls.push({ method: request.method(), fingerprint: url.searchParams.get("fingerprint") });
  });
  const firstRead = page.waitForResponse((response) => lookupPattern.test(response.url()));
  await page.goto("/#predictions=v3.AYIKQA");
  const fullUrl = page.url();
  expect((await firstRead).status()).toBe(404);
  expect(page.url()).toBe(fullUrl);
  expect(calls).toEqual([{ method: "GET", fingerprint: fingerprint("v3.AYIKQA") }]);
  await card(page, 1).locator(".details-toggle").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Exact scores & bonus points", { exact: true }).click();
  const nextRead = page.waitForResponse((response) => lookupPattern.test(response.url()));
  await dialog.locator("#match-1-homeScore").fill("30");
  const editedUrl = page.url();
  expect(tokenIn(editedUrl)).toMatch(/^v3\./);
  await expect(dialog.locator("#match-1-homeScore")).toHaveValue("30");
  expect((await nextRead).status()).toBe(404);
  expect(page.url()).toBe(editedUrl);
  expect(calls).toEqual([
    { method: "GET", fingerprint: fingerprint("v3.AYIKQA") },
    { method: "GET", fingerprint: fingerprint(tokenIn(editedUrl)) },
  ]);
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(undo(page)).toBeEnabled();
  const readsBeforeMalformed = calls.length;
  await page.goto("/#predictions=v9.future", { waitUntil: "networkidle" });
  const malformedUrl = page.url();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(calls).toHaveLength(readsBeforeMalformed);
  expect(page.url()).toBe(malformedUrl);
});

test("a delayed lookup cannot replace a newer prediction or clear its undo history", async ({ page, request }) => {
  const stored = await save(request, "v3.AYIKQA");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let heldReads = 0;
  let completed!: () => void;
  const finished = new Promise<void>((resolve) => { completed = resolve; });
  await page.route(lookupPattern, async (route) => {
    if (new URL(route.request().url()).searchParams.get("fingerprint") !== fingerprint(stored.token)) {
      await route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"Prediction link not found."}' });
      return;
    }
    heldReads++;
    await gate;
    try {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(stored) });
    } catch {
      // Cancellation on the newer edit may have already disposed this request.
    } finally { completed(); }
  });
  await page.goto(`/#predictions=${stored.token}`);
  await expect.poll(() => heldReads).toBe(1);
  const historyLength = await page.evaluate(() => history.length);
  const changedRead = page.waitForResponse((response) => lookupPattern.test(response.url())
    && new URL(response.url()).searchParams.get("fingerprint") !== fingerprint(stored.token));
  await card(page, 1).getByRole("button", { name: "Hong Kong China", exact: true }).click();
  const changedUrl = page.url();
  expect(tokenIn(changedUrl)).toMatch(/^v3\./);
  release();
  await finished;
  expect((await changedRead).status()).toBe(404);
  expect(page.url()).toBe(changedUrl);
  await expect(card(page, 1).getByRole("button", { name: "Hong Kong China", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(undo(page)).toBeEnabled();
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
});

test("short-address replacement preserves undo and Back/Forward between cached aliases imports without loops", async ({ page }) => {
  await captureClipboard(page);
  await missLookups(page);
  const calls: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/shares") calls.push(request.method());
  });
  await page.goto("/");
  const historyLength = await page.evaluate(() => history.length);
  await card(page, 1).getByRole("button", { name: "Australia", exact: true }).click();
  await copy(page).click();
  const firstUrl = await copiedLink(page);
  await expect(page).toHaveURL(firstUrl);
  await expect(undo(page)).toBeEnabled();
  await card(page, 1).getByRole("button", { name: "Hong Kong China", exact: true }).click();
  expect(new URL(page.url()).pathname).toBe("/");
  expect(tokenIn(page.url())).toMatch(/^v3\./);
  const secondToken = tokenIn(page.url());
  await page.evaluate(() => Reflect.set(window, "copiedPredictionLink", ""));
  await copy(page).click();
  const secondUrl = await copiedLink(page);
  expect(secondUrl).not.toBe(firstUrl);
  await expect(page).toHaveURL(secondUrl);
  await expect(undo(page)).toBeEnabled();
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  const callsBeforeNavigation = calls.length;
  await page.evaluate((url) => {
    history.pushState(null, "", url);
    dispatchEvent(new PopStateEvent("popstate"));
  }, firstUrl);
  await expect(page).toHaveURL(firstUrl);
  await expect(card(page, 1).getByRole("button", { name: "Australia", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(undo(page)).toBeDisabled();
  await page.goBack();
  await expect(page).toHaveURL(secondUrl);
  await expect(card(page, 1).getByRole("button", { name: "Hong Kong China", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(undo(page)).toBeDisabled();
  await page.goForward();
  await expect(page).toHaveURL(firstUrl);
  await expect(card(page, 1).getByRole("button", { name: "Australia", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => history.length)).toBe(historyLength + 1);
  expect(calls).toHaveLength(callsBeforeNavigation);
  await expect(page.getByRole("alert")).toHaveCount(0);
  // An immutable alias must never display a different fragment scenario that
  // the Worker would discard on refresh. Preserve it until explicit recovery.
  const conflictingUrl = `${firstUrl}#predictions=${secondToken}`;
  await page.evaluate((url) => {
    history.pushState(null, "", url);
    dispatchEvent(new PopStateEvent("popstate"));
  }, conflictingUrl);
  await expect(page.getByRole("alert")).toContainText("A short prediction link cannot also contain prediction details.");
  expect(page.url()).toBe(conflictingUrl);
  await expect(copy(page)).toBeDisabled();
  await expect(card(page, 1).locator(".winner-choice").first()).toBeDisabled();
  await page.waitForLoadState("networkidle");
  expect(calls).toHaveLength(callsBeforeNavigation);
  expect(page.url()).toBe(conflictingUrl);
  await page.getByRole("button", { name: "Start fresh", exact: true }).click();
  expect(page.url()).toBe(new URL("/", firstUrl).href);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".fixture-card .result-preview strong")).toHaveCount(0);
  await expect(undo(page)).toBeDisabled();
});

test("short aliases preserve legacy slash payloads as canonical 2023 scenarios", async ({ request, browser, baseURL }) => {
  const legacyToken = Buffer.from([48, 1, 0, 0, 0, 0, 0, 255, 255, 255]).toString("base64");
  const stored = await save(request, legacyToken);
  const fresh = await browser.newContext();
  const page = await fresh.newPage();
  const shortUrl = new URL(sharePath(stored.alias), baseURL).href;
  await page.goto(shortUrl);
  await expect(page).toHaveURL(shortUrl);
  await expect(page.locator(".eyebrow")).toHaveText("Legacy 2023 tournament");
  await expect(page.locator(".fixture-card")).toHaveCount(40);
  await card(page, 1).locator(".details-toggle").click();
  await expect(page.getByRole("dialog").locator("#match-1-homeScore")).toHaveValue("255");
  await expect(page.getByRole("dialog").locator("#match-1-awayScore")).toHaveValue("255");
  await fresh.close();
});
