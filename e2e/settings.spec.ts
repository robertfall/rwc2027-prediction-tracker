import { expect, test, type Page } from "@playwright/test";

const storageKey = "rwc2027.timezone.v1";
const settings = (page: Page) => page.getByRole("button", { name: "Settings", exact: true });
const menu = (page: Page) => page.getByRole("dialog", { name: "Settings", exact: true });
const timezone = (page: Page) => menu(page).getByRole("combobox", { name: "Timezone", exact: true });
const card = (page: Page, id: number) => page.locator(`[data-fixture-id="${id}"]`);
const undo = (page: Page) => page.getByRole("button", { name: "Undo last prediction action", exact: true });
const redo = (page: Page) => page.getByRole("button", { name: "Redo prediction action", exact: true });
const share = (page: Page) => page.getByRole("button", { name: "Share", exact: true });

test.use({ timezoneId: "Africa/Johannesburg", locale: "en-GB" });
test.beforeEach(async ({ page }) => {
  await page.route("**/api/shares?fingerprint=*", (route) => route.fulfill({ status: 404, json: { error: "Prediction link not found." } }));
});

async function openSettings(page: Page): Promise<void> {
  await settings(page).click();
  await expect(menu(page)).toBeVisible();
  await expect(timezone(page)).toBeFocused();
}

async function chooseTimezone(page: Page, value: string): Promise<void> {
  await openSettings(page);
  await timezone(page).selectOption(value);
  await expect(timezone(page)).toHaveValue(value);
  await timezone(page).press("Escape");
  await expect(menu(page)).toHaveCount(0);
  await expect(settings(page)).toBeFocused();
}

async function selectSouthAfrica(page: Page): Promise<void> {
  await page.getByRole("combobox", { name: "Focus", exact: true }).click();
  await page.getByRole("listbox", { name: "Focus teams", exact: true }).getByRole("option")
    .and(page.locator('[data-team-id="za"]')).click();
}

test("timezone changes update fixture dates, Details, timeline days and shared images without editing predictions", async ({ page }) => {
  await page.goto("/");
  const blankUrl = page.url();
  await selectSouthAfrica(page);
  await card(page, 7).getByRole("button", { name: "South Africa", exact: true }).click();
  const pickedUrl = page.url();
  const historyLength = await page.evaluate(() => history.length);
  await expect(card(page, 7).locator(".fixture-meta time")).toHaveText("3 Oct · 05:45");
  await openSettings(page);
  await expect(timezone(page)).toHaveValue("");
  await expect(timezone(page).locator('option[value=""]')).toHaveText(/System timezone.*Africa\s*\/\s*Johannesburg/);
  await timezone(page).press("Escape");

  await chooseTimezone(page, "UTC");
  await expect(card(page, 7).locator(".fixture-meta time")).toHaveText("3 Oct · 03:45");
  await page.getByRole("group", { name: "View", exact: true }).getByRole("button", { name: "Timeline", exact: true }).click();
  const day = () => page.locator(".timeline-day").filter({ has: card(page, 7) });
  await expect(day()).toHaveAttribute("data-date-key", "2027-10-03");
  await expect(day().locator(".timeline-day-number")).toHaveText("03");
  await expect(day().locator(".timeline-weekday")).toHaveText("Sun");
  await expect(page.locator(".timeline-group").first().locator(".timeline-heading > span").first()).toHaveText("3 Oct");

  await chooseTimezone(page, "America/New_York");
  await expect(card(page, 7).locator(".fixture-meta time")).toHaveText("2 Oct · 23:45");
  await expect(day()).toHaveAttribute("data-date-key", "2027-10-02");
  await expect(day().locator(".timeline-day-number")).toHaveText("02");
  await expect(day().locator(".timeline-weekday")).toHaveText("Sat");
  await expect(day().locator(".timeline-month")).toHaveText("Oct");
  await expect(page.locator(".timeline-group").first().locator(".timeline-heading > span").first()).toHaveText(/2\s*[–-]\s*3 Oct/);
  await card(page, 7).getByRole("button", { name: "Details for match 7", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".match-dialog-meta")).toHaveText("Match 7 · 2 Oct · 23:45");
  await page.getByRole("dialog").getByRole("button", { name: "Done", exact: true }).click();

  await share(page).click();
  await page.getByRole("dialog", { name: "Share predictions", exact: true })
    .getByRole("button", { name: "Share Pool Matches - South Africa", exact: true }).click();
  const poster = page.getByRole("dialog", { name: "Pool match infographic", exact: true });
  await expect(poster.locator(".pool-infographic-preview")).toBeVisible();
  const graphic = await poster.locator(".pool-infographic-preview").evaluate(async (element) => {
    if (!(element instanceof HTMLImageElement)) throw new Error("A shared image must have an SVG preview.");
    const svg = new DOMParser().parseFromString(await (await fetch(element.src)).text(), "image/svg+xml");
    return { row: svg.querySelector("#match-7")?.textContent, text: svg.documentElement.textContent };
  });
  expect(graphic.row).toContain("SAT 2 OCT");
  expect(graphic.row).toContain("23:45");
  expect(graphic.row).toContain("24 – 17");
  expect(graphic.text).toContain("America/New_York");
  await page.keyboard.press("Escape");
  expect(page.url()).toBe(pickedUrl);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await expect(undo(page)).toBeEnabled();
  await expect(redo(page)).toBeDisabled();
  await undo(page).click();
  expect(page.url()).toBe(blankUrl);
  await expect(undo(page)).toBeDisabled();
  await expect(redo(page)).toBeEnabled();
  await expect(card(page, 7).locator(".fixture-meta time")).toHaveText("2 Oct · 23:45");
});

test("an explicit timezone persists across refreshes and same-context tabs; System clears the preference", async ({ page, context }) => {
  await page.goto("/");
  await card(page, 7).getByRole("button", { name: "South Africa", exact: true }).click();
  const pickedUrl = page.url();
  const historyLength = await page.evaluate(() => history.length);
  await chooseTimezone(page, "America/New_York");
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe("America/New_York");
  expect(page.url()).toBe(pickedUrl);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await page.reload();
  await expect(card(page, 7).locator(".fixture-meta time")).toHaveText("2 Oct · 23:45");
  await expect(card(page, 7).getByRole("button", { name: "South Africa", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(undo(page)).toBeDisabled();
  await openSettings(page);
  await expect(timezone(page)).toHaveValue("America/New_York");
  await timezone(page).press("Escape");

  const tab = await context.newPage();
  await tab.route("**/api/shares?fingerprint=*", (route) => route.fulfill({ status: 404, json: { error: "Prediction link not found." } }));
  await tab.goto(pickedUrl);
  await expect(card(tab, 7).locator(".fixture-meta time")).toHaveText("2 Oct · 23:45");
  await openSettings(tab);
  await expect(timezone(tab)).toHaveValue("America/New_York");
  await timezone(tab).selectOption("");
  expect(await tab.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull();
  await timezone(tab).press("Escape");
  await expect(card(tab, 7).locator(".fixture-meta time")).toHaveText("3 Oct · 05:45");
  expect(tab.url()).toBe(pickedUrl);
  await tab.close();
  await page.reload();
  await expect(card(page, 7).locator(".fixture-meta time")).toHaveText("3 Oct · 05:45");
  await openSettings(page);
  await expect(timezone(page)).toHaveValue("");
  await timezone(page).press("Escape");
  expect(page.url()).toBe(pickedUrl);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await expect(undo(page)).toBeDisabled();
});

test("invalid saved zones fall back to System and the compact Settings popover supports keyboard and outside dismissal", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 320, height: 812 });
  await page.addInitScript(() => { Reflect.set(Intl, "supportedValuesOf", undefined); });
  await page.goto("/");
  await page.evaluate((key) => localStorage.setItem(key, "Invalid/Timezone"), storageKey);
  await page.reload();
  const originalUrl = page.url();
  const historyLength = await page.evaluate(() => history.length);
  await expect(card(page, 7).locator(".fixture-meta time")).toHaveText("3 Oct · 05:45");
  const [settingsBounds, shareBounds] = await Promise.all([settings(page).boundingBox(), share(page).boundingBox()]);
  expect(settingsBounds?.height).toBe(44);
  expect(settingsBounds?.height).toBe(shareBounds?.height);
  await settings(page).focus();
  await settings(page).press("Enter");
  await expect(menu(page)).toBeVisible();
  await expect(timezone(page)).toBeFocused();
  await expect(timezone(page)).toHaveValue("");
  for (const zone of ["UTC", "Africa/Johannesburg", "America/New_York"]) {
    await expect(timezone(page).locator(`option[value="${zone}"]`)).toHaveCount(1);
  }
  const bounds = await menu(page).boundingBox();
  if (!bounds) throw new Error("The Settings popover must be visible.");
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await timezone(page).selectOption("UTC");
  await timezone(page).press("Escape");
  await expect(menu(page)).toHaveCount(0);
  await expect(settings(page)).toBeFocused();
  await expect(card(page, 7).locator(".fixture-meta time")).toHaveText("3 Oct · 03:45");
  await settings(page).press("Space");
  await expect(menu(page)).toBeVisible();
  await page.locator(".wordmark").click();
  await expect(menu(page)).toHaveCount(0);
  expect(page.url()).toBe(originalUrl);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await expect(undo(page)).toBeDisabled();
  expect(errors).toEqual([]);
});

test("blocked timezone storage still permits local selection, System reset and prediction undo", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((key) => {
    const calls = { getItem: 0, setItem: 0, removeItem: 0 };
    Reflect.set(window, "blockedTimezoneStorageCalls", calls);
    const originalGet = Storage.prototype.getItem;
    const originalSet = Storage.prototype.setItem;
    const originalRemove = Storage.prototype.removeItem;
    Storage.prototype.getItem = function (candidate) {
      if (candidate === key) { calls.getItem++; throw new DOMException("Storage blocked", "SecurityError"); }
      return originalGet.call(this, candidate);
    };
    Storage.prototype.setItem = function (candidate, value) {
      if (candidate === key) { calls.setItem++; throw new DOMException("Storage blocked", "SecurityError"); }
      originalSet.call(this, candidate, value);
    };
    Storage.prototype.removeItem = function (candidate) {
      if (candidate === key) { calls.removeItem++; throw new DOMException("Storage blocked", "SecurityError"); }
      originalRemove.call(this, candidate);
    };
  }, storageKey);
  await page.goto("/");
  const blankUrl = page.url();
  await card(page, 7).getByRole("button", { name: "South Africa", exact: true }).click();
  const pickedUrl = page.url();
  const historyLength = await page.evaluate(() => history.length);
  await chooseTimezone(page, "UTC");
  await expect(card(page, 7).locator(".fixture-meta time")).toHaveText("3 Oct · 03:45");
  await chooseTimezone(page, "America/New_York");
  await expect(card(page, 7).locator(".fixture-meta time")).toHaveText("2 Oct · 23:45");
  await chooseTimezone(page, "");
  await expect(card(page, 7).locator(".fixture-meta time")).toHaveText("3 Oct · 05:45");
  expect(page.url()).toBe(pickedUrl);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await expect(undo(page)).toBeEnabled();
  await expect(redo(page)).toBeDisabled();
  const calls = await page.evaluate(() => Reflect.get(window, "blockedTimezoneStorageCalls") as Record<string, number>);
  for (const method of ["getItem", "setItem", "removeItem"]) expect(calls[method]).toBeGreaterThan(0);
  await undo(page).click();
  expect(page.url()).toBe(blankUrl);
  await expect(undo(page)).toBeDisabled();
  await expect(redo(page)).toBeEnabled();
  await expect(card(page, 7).locator(".fixture-meta time")).toHaveText("3 Oct · 05:45");
  expect(errors).toEqual([]);
});
