import { expect, test, type Page } from "@playwright/test";

const card = (page: Page, id: number) => page.locator(`[data-fixture-id="${id}"]`);
const fill = (page: Page) => page.getByRole("button", { name: "Fill unpicked matches", exact: true });
const undo = (page: Page) => page.getByRole("button", { name: "Undo last prediction action" });
const redo = (page: Page) => page.getByRole("button", { name: "Redo prediction action" });
const knockout = (page: Page) => page.getByRole("button", { name: /\bKnockout\b/ });

test("rankings fill the entire tournament offline with one URL write and one undo action", async ({ page, context, browser }) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await page.goto("/", { waitUntil: "networkidle" });
  const blankUrl = page.url();
  const historyLength = await page.evaluate(() => history.length);
  await page.evaluate(() => {
    Reflect.set(window, "engineUrlWrites", 0);
    const replace = history.replaceState.bind(history);
    history.replaceState = (...args) => {
      Reflect.set(window, "engineUrlWrites", Number(Reflect.get(window, "engineUrlWrites")) + 1);
      replace(...args);
    };
  });
  const editRequests: string[] = [];
  page.on("request", (request) => {
    if (["fetch", "xhr"].includes(request.resourceType())) editRequests.push(request.url());
  });
  await context.setOffline(true);
  await fill(page).click();
  await expect(page.getByRole("button", { name: /\bPools\b/ })).toContainText("36/36");
  await expect(knockout(page)).toContainText("16/16");
  await expect(fill(page)).toBeDisabled();
  const token = new URL(page.url()).hash.slice("#predictions=".length);
  expect(token.startsWith("v3.")).toBe(true);
  expect(token.length).toBeLessThanOrEqual(355); // Existing custom-result pins, no new profile.
  expect(Buffer.from(token.slice(3), "base64url")[0]).toBe(1); // Retained 2027/defaults-v1 profile.
  expect(await page.evaluate(() => Reflect.get(window, "engineUrlWrites"))).toBe(1);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  expect(editRequests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await knockout(page).click();
  await expect(card(page, 51).locator(".result-preview strong")).toBeVisible();
  await expect(card(page, 52).locator(".result-preview strong")).toBeVisible();
  const final = await card(page, 52).innerText();
  const savedUrl = page.url();
  await undo(page).click();
  expect(page.url()).toBe(blankUrl);
  await expect(undo(page)).toBeDisabled();
  await expect(page.locator(".fixture-card .result-preview strong")).toHaveCount(0);
  await redo(page).click();
  expect(page.url()).toBe(savedUrl);
  await knockout(page).click();
  await expect(card(page, 52)).toHaveText(final, { useInnerText: true });
  await context.setOffline(false);
  const shared = await browser.newPage();
  await shared.goto(savedUrl);
  await knockout(shared).click();
  await expect(card(shared, 52)).toHaveText(final, { useInnerText: true });
  await expect(fill(shared)).toBeDisabled();
  await expect(undo(shared)).toBeDisabled();
  await shared.close();
});

test("fill preserves an upset and detailed choices, then one undo restores only those picks", async ({ page }) => {
  await page.goto("/");
  await card(page, 1).getByRole("button", { name: "Hong Kong China", exact: true }).click();
  await card(page, 1).locator(".details-toggle").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Exact scores & bonus points", { exact: true }).click();
  await dialog.locator("#match-1-margin").fill("5");
  await dialog.locator("#match-1-awayTries").fill("4");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  const priorUrl = page.url();
  const priorResult = await card(page, 1).locator(".result-preview").innerText();
  await fill(page).click();
  await expect(card(page, 1).getByRole("button", { name: "Hong Kong China", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(card(page, 1).locator(".result-preview")).toHaveText(priorResult, { useInnerText: true });
  await expect(knockout(page)).toContainText("16/16");
  await undo(page).click();
  expect(page.url()).toBe(priorUrl);
  await expect(card(page, 1).locator(".result-preview")).toHaveText(priorResult, { useInnerText: true });
  await expect(page.locator(".fixture-card .result-preview strong")).toHaveCount(1);
});

test("fill keeps conflicting choices visible and leaves dependent knockout matches waiting", async ({ page }) => {
  await page.goto("/");
  await card(page, 1).getByRole("button", { name: "Australia", exact: true }).click();
  await card(page, 1).locator(".details-toggle").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Exact scores & bonus points", { exact: true }).click();
  await dialog.locator("#match-1-homeScore").fill("10");
  await dialog.locator("#match-1-awayScore").fill("20");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  const conflictUrl = page.url();
  await fill(page).click();
  await expect(card(page, 1).locator(".fixture-issues")).toBeVisible();
  await expect(page.locator(".fixture-card .result-preview strong")).toHaveCount(36);
  await expect(page.getByRole("button", { name: /\bPools\b/ })).toContainText("35/36");
  await expect(knockout(page)).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator(".scenario-notice")).toContainText(/waiting|conflict/i);
  await undo(page).click();
  expect(page.url()).toBe(conflictUrl);
});

test("filling an old link preserves its profile and saved scores, with one undo", async ({ page }) => {
  await page.goto("/#predictions=v3.AYIKQA");
  const originalUrl = page.url();
  await card(page, 1).locator(".details-toggle").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".match-dialog-preview strong")).toHaveText("24 – 17");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  expect(page.url()).toBe(originalUrl);
  await fill(page).click();
  await expect(card(page, 1).locator(".result-preview strong")).toHaveText("By 7");
  await expect(knockout(page)).toContainText("16/16");
  expect(Buffer.from(new URL(page.url()).hash.slice("#predictions=v3.".length), "base64url")[0]).toBe(1);
  await undo(page).click();
  expect(page.url()).toBe(originalUrl);
  await expect(page.locator(".fixture-card .result-preview strong")).toHaveCount(1);
});
