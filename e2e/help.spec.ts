import { expect, test, type Page } from "@playwright/test";

const help = (page: Page) => page.getByRole("button", { name: "How does it work?", exact: true });
const dialog = (page: Page) => page.getByRole("dialog", { name: "How does it work?", exact: true });
const close = (page: Page) => dialog(page).getByRole("button", { name: "Close help", exact: true });
const gotIt = (page: Page) => dialog(page).getByRole("button", { name: "Got it", exact: true });
const focus = (page: Page) => page.getByRole("combobox", { name: "Focus", exact: true });
const card = (page: Page, id: number) => page.locator(`[data-fixture-id="${id}"]`);
const undo = (page: Page) => page.getByRole("button", { name: "Undo last prediction action", exact: true });
const redo = (page: Page) => page.getByRole("button", { name: "Redo prediction action", exact: true });

test.beforeEach(async ({ page }) => {
  await page.route("**/api/shares?fingerprint=*", (route) => route.fulfill({ status: 404, json: { error: "Prediction link not found." } }));
});

async function preferences(page: Page) {
  return page.evaluate(() => ({
    focus: localStorage.getItem("rwc2027.focus-team.v1"),
    timezone: localStorage.getItem("rwc2027.timezone.v1"),
  }));
}

async function selectSouthAfrica(page: Page): Promise<void> {
  await focus(page).click();
  await page.getByRole("listbox", { name: "Focus teams", exact: true }).getByRole("option")
    .and(page.locator('[data-team-id="za"]')).click();
  await expect(focus(page)).toHaveAttribute("data-team-id", "za");
}

test("header help supports keyboard, buttons and backdrop without changing predictions, preferences or undo", async ({ page }) => {
  const errors: string[] = [];
  const writes: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname.startsWith("/api/")) writes.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(dialog(page)).toHaveCount(0);
  const blankUrl = page.url();
  await selectSouthAfrica(page);
  await card(page, 7).getByRole("button", { name: "South Africa", exact: true }).click();
  const pickedUrl = page.url();
  const savedPreferences = await preferences(page);
  const historyLength = await page.evaluate(() => history.length);

  await help(page).focus();
  await help(page).press("Enter");
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByRole("heading", { name: "How does it work?", exact: true })).toBeVisible();
  await expect(close(page)).toBeFocused();
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Meta+z");
  expect(page.url()).toBe(pickedUrl);
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  await expect(help(page)).toBeFocused();

  await help(page).press("Space");
  await expect(dialog(page)).toBeVisible();
  await close(page).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(help(page)).toBeFocused();

  await help(page).click();
  await gotIt(page).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(help(page)).toBeFocused();

  await help(page).click();
  const bounds = await dialog(page).boundingBox();
  if (!bounds || bounds.x < 2) throw new Error("Desktop help must leave a clickable backdrop.");
  await page.mouse.click(bounds.x / 2, bounds.y + Math.min(bounds.height / 2, 200));
  await expect(dialog(page)).toHaveCount(0);
  await expect(help(page)).toBeFocused();

  expect(page.url()).toBe(pickedUrl);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  expect(await preferences(page)).toEqual(savedPreferences);
  await expect(focus(page)).toHaveAttribute("data-team-id", "za");
  await expect(card(page, 7).getByRole("button", { name: "South Africa", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(undo(page)).toBeEnabled();
  await expect(redo(page)).toBeDisabled();
  await undo(page).click();
  expect(page.url()).toBe(blankUrl);
  await expect(undo(page)).toBeDisabled();
  await expect(redo(page)).toBeEnabled();
  await help(page).click();
  await page.keyboard.press("Control+y");
  await page.keyboard.press("Meta+Shift+z");
  expect(page.url()).toBe(blankUrl);
  await gotIt(page).click();
  await expect(redo(page)).toBeEnabled();
  await redo(page).click();
  expect(page.url()).toBe(pickedUrl);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("help fits a 320px header and keeps its scrollable content and dismissal controls reachable", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  const originalUrl = page.url();
  const triggerBounds = await help(page).boundingBox();
  if (!triggerBounds) throw new Error("The header help button must be visible.");
  expect(triggerBounds.width).toBeGreaterThanOrEqual(44);
  expect(triggerBounds.height).toBeGreaterThanOrEqual(44);
  expect(triggerBounds.x).toBeGreaterThanOrEqual(0);
  expect(triggerBounds.x + triggerBounds.width).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

  await help(page).click();
  await expect(dialog(page)).toBeVisible();
  await expect(close(page)).toBeFocused();
  const bounds = await dialog(page).boundingBox();
  if (!bounds) throw new Error("Mobile help must be visible.");
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(568);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

  const scrollRegion = await dialog(page).evaluate((element) => {
    const candidates = [element, ...element.querySelectorAll<HTMLElement>("*")];
    const region = candidates.find((candidate) => candidate.scrollHeight > candidate.clientHeight + 1
      && /auto|scroll/.test(getComputedStyle(candidate).overflowY));
    if (!region) return undefined;
    region.scrollTop = region.scrollHeight;
    return { scrolled: region.scrollTop, overflow: region.scrollWidth - region.clientWidth };
  });
  expect(scrollRegion?.scrolled).toBeGreaterThan(0);
  expect(scrollRegion?.overflow).toBeLessThanOrEqual(1);
  await gotIt(page).focus();
  await expect(gotIt(page)).toBeInViewport();
  await gotIt(page).press("Enter");
  await expect(dialog(page)).toHaveCount(0);
  await expect(help(page)).toBeFocused();
  expect(page.url()).toBe(originalUrl);
  await expect(undo(page)).toBeDisabled();

  await page.getByRole("button", { name: "Fill unpicked matches", exact: true }).click();
  const stages = page.getByRole("navigation", { name: "Tournament stages", exact: true });
  const knockout = stages.getByRole("button", { name: /\bKnockout\b/ });
  await expect(stages.getByRole("button", { name: /\bPools\b/ })).toContainText("36/36");
  await expect(knockout).toContainText("16/16");
  await expect(knockout).toHaveAttribute("aria-disabled", "false");
  const [unlockedHelp, unlockedStages, unlockedKnockout] = await Promise.all([
    help(page).boundingBox(), stages.boundingBox(), knockout.boundingBox(),
  ]);
  if (!unlockedHelp || !unlockedStages || !unlockedKnockout) throw new Error("Unlocked stages and help must remain visible.");
  expect(unlockedHelp.width).toBeGreaterThanOrEqual(44);
  expect(unlockedHelp.height).toBeGreaterThanOrEqual(44);
  expect(unlockedHelp.x).toBeGreaterThanOrEqual(0);
  expect(unlockedHelp.x + unlockedHelp.width).toBeLessThanOrEqual(320);
  expect(Math.abs(unlockedStages.y + unlockedStages.height / 2 - (unlockedHelp.y + unlockedHelp.height / 2))).toBeLessThanOrEqual(1);
  expect(unlockedKnockout.x + unlockedKnockout.width).toBeLessThanOrEqual(unlockedHelp.x);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test("help works without native modal support, traps focus and restores the trigger after dismissal", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => { Reflect.set(HTMLDialogElement.prototype, "showModal", undefined); });
  await page.goto("/");
  const originalUrl = page.url();
  const historyLength = await page.evaluate(() => history.length);
  await help(page).focus();
  await help(page).press("Enter");
  await expect(dialog(page)).toBeVisible();
  await expect(close(page)).toBeFocused();
  await close(page).press("Shift+Tab");
  await expect(gotIt(page)).toBeFocused();
  await gotIt(page).press("Tab");
  await expect(close(page)).toBeFocused();
  await close(page).press("Tab");
  await expect(dialog(page).locator(".help-dialog-body")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(gotIt(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  await expect(help(page)).toBeFocused();

  await help(page).click();
  const bounds = await dialog(page).boundingBox();
  if (!bounds || bounds.x < 2) throw new Error("Fallback help must leave a clickable backdrop.");
  await page.mouse.click(bounds.x / 2, bounds.y + Math.min(bounds.height / 2, 200));
  await expect(dialog(page)).toHaveCount(0);
  await expect(help(page)).toBeFocused();
  expect(page.url()).toBe(originalUrl);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await expect(undo(page)).toBeDisabled();
  expect(errors).toEqual([]);
});
