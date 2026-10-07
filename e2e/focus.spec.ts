import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/shares?fingerprint=*", (route) => route.fulfill({ status: 404, json: { error: "Prediction link not found." } }));
});

const card = (page: Page, id: number) => page.locator(`[data-fixture-id="${id}"]`);
const focus = (page: Page) => page.getByRole("combobox", { name: "Focus", exact: true });
const focusTeams = (page: Page) => page.getByRole("listbox", { name: "Focus teams", exact: true });
const undo = (page: Page) => page.getByRole("button", { name: "Undo last prediction action" });
const redo = (page: Page) => page.getByRole("button", { name: "Redo prediction action" });
const fill = (page: Page) => page.getByRole("button", { name: "Fill unpicked matches", exact: true });
const pools = (page: Page) => page.getByRole("button", { name: /\bPools\b/ });
const knockout = (page: Page) => page.getByRole("button", { name: /\bKnockout\b/ });
const view = (page: Page) => page.getByRole("group", { name: "View", exact: true });
const poolB = [7, 9, 21, 24, 32, 36];
const poolA = [1, 3, 16, 18, 25, 29];
const southAfricaRoute = [40, 45, 49, 52];
const focusStorageKey = "rwc2027.focus-team.v1";

async function selectTeam(page: Page, id: string): Promise<void> {
  await focus(page).click();
  await focusTeams(page).getByRole("option").and(page.locator(`[data-team-id="${id}"]`)).click();
  await expect(focus(page)).toHaveAttribute("data-team-id", id);
  await expect(focusTeams(page)).toHaveCount(0);
}

async function expectTeamCount(page: Page, count: number): Promise<void> {
  await focus(page).click();
  await expect(focusTeams(page).getByRole("option")).toHaveCount(count);
  await focus(page).press("Escape");
  await expect(focusTeams(page)).toHaveCount(0);
}

async function expectFixtures(page: Page, ids: number[]): Promise<void> {
  await expect.poll(() => page.locator(".fixture-card").evaluateAll((elements) => elements
    .map((element) => Number(element.getAttribute("data-fixture-id"))).sort((a, b) => a - b))).toEqual([...ids].sort((a, b) => a - b));
}

test("switching team focus resets the pool filter and preserves prediction URLs, undo and redo", async ({ page }) => {
  await page.goto("/");
  const blankUrl = page.url();
  await card(page, 1).getByRole("button", { name: "Australia", exact: true }).click();
  const pickedUrl = page.url();
  const historyLength = await page.evaluate(() => history.length);
  await page.getByRole("group", { name: "Pool filter", exact: true }).getByRole("button", { name: "A", exact: true }).click();
  await selectTeam(page, "za");
  await expectFixtures(page, poolB);
  await expect(page.locator(".pool-section")).toHaveAttribute("data-pool-id", "B");
  await expect(page.getByRole("group", { name: "Pool filter", exact: true })).toHaveCount(0);
  await expectTeamCount(page, 25);
  await expect(undo(page)).toBeEnabled();
  expect(page.url()).toBe(pickedUrl);

  await view(page).getByRole("button", { name: "Timeline", exact: true }).click();
  await expectFixtures(page, poolB);
  await expect(page.locator(".standings--compact")).toHaveCount(1);
  await expect(page.getByRole("table", { name: "Pool B standings", exact: true })).toBeVisible();
  await expect(page.locator(".timeline-heading h2")).toHaveText(["Round 1", "Round 2", "Round 3"]);
  for (const team of ["ge", "za", "nz"]) await selectTeam(page, team);
  await expectFixtures(page, poolA);
  await expect(page.getByRole("table", { name: "Pool A standings", exact: true })).toBeVisible();
  expect(page.url()).toBe(pickedUrl);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);

  await undo(page).click();
  expect(page.url()).toBe(blankUrl);
  await expect(undo(page)).toBeDisabled();
  await expect(redo(page)).toBeEnabled();
  await selectTeam(page, "za");
  await expect(redo(page)).toBeEnabled();
  await redo(page).click();
  expect(page.url()).toBe(pickedUrl);
  await selectTeam(page, "");
  await expect(page.getByRole("group", { name: "Pool filter", exact: true }).getByRole("button", { name: "All", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".fixture-card")).toHaveCount(36);
  await expect(card(page, 1).getByRole("button", { name: "Australia", exact: true })).toHaveAttribute("aria-pressed", "true");
  await undo(page).click();
  expect(page.url()).toBe(blankUrl);
  await expect(undo(page)).toBeDisabled();
});

test("fill stays global while every desktop view filters the focused prediction and bracket sources", async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const blankUrl = page.url();
  await selectTeam(page, "za");
  await expectFixtures(page, poolB);
  await fill(page).click();
  await expect(pools(page)).toContainText("36/36");
  await expect(knockout(page)).toContainText("16/16");
  await expect(fill(page)).toBeDisabled();
  const filledUrl = page.url();
  await expectFixtures(page, poolB);
  await view(page).getByRole("button", { name: "Timeline", exact: true }).click();
  await expectFixtures(page, poolB);
  await expect(page.locator(".standings--compact")).toHaveCount(1);
  await knockout(page).click();
  for (const layout of ["Rounds", "Timeline", "Bracket"]) {
    await view(page).getByRole("button", { name: layout, exact: true }).click();
    await expectFixtures(page, southAfricaRoute);
    expect(page.url()).toBe(filledUrl);
  }
  const round16 = page.locator('[data-bracket-stage="round16"]');
  const pair = round16.locator('[data-next-fixture-id="45"]');
  await expect(pair.locator(".fixture-card")).toHaveCount(1);
  await expect(pair.locator('[data-fixture-id="40"]')).toBeVisible();
  await expect(page.locator(".bracket-match-wrap--empty .fixture-card")).toHaveCount(0);
  await expect(round16.locator('[data-next-fixture-id="46"] .bracket-link-horizontal')).toHaveCount(0);
  const [source, destination, vertical, horizontal] = await Promise.all([
    card(page, 40).boundingBox(), card(page, 45).boundingBox(),
    pair.locator(".bracket-link-vertical").boundingBox(), pair.locator(".bracket-link-horizontal").boundingBox(),
  ]);
  if (!source || !destination || !vertical || !horizontal) throw new Error("The focused source, destination and connector must remain visible.");
  expect(Math.abs(source.y + source.height / 2 - (vertical.y + vertical.height))).toBeLessThanOrEqual(1);
  expect(Math.abs(destination.y + destination.height / 2 - horizontal.y)).toBeLessThanOrEqual(1);

  await selectTeam(page, "");
  await expect(page.locator(".fixture-card")).toHaveCount(16);
  expect(page.url()).toBe(filledUrl);
  await selectTeam(page, "za");
  const replay = await browser.newPage();
  await replay.route("**/api/shares?fingerprint=*", (route) => route.fulfill({ status: 404, json: { error: "Prediction link not found." } }));
  await replay.goto(filledUrl);
  await expect(focus(replay)).toHaveAttribute("data-team-id", "");
  await expect(pools(replay)).toContainText("36/36");
  await expect(undo(replay)).toBeDisabled();
  await knockout(replay).click();
  await expect(replay.locator(".fixture-card")).toHaveCount(16);
  await replay.close();
  await undo(page).click();
  expect(page.url()).toBe(blankUrl);
  await expectFixtures(page, poolB);
  await expect(page.locator(".result-preview strong")).toHaveCount(0);
  await expect(undo(page)).toBeDisabled();
  await expect(focus(page)).toHaveAttribute("data-team-id", "za");
});

test("a third-place focus reveals other pools and mobile bracket rounds stop at the predicted exit", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await selectTeam(page, "ge");
  await expectFixtures(page, poolB);
  await fill(page).click();
  const filledUrl = page.url();
  await expect(page.locator(".fixture-card")).toHaveCount(36);
  await expect(page.locator(".pool-section")).toHaveCount(6);
  await view(page).getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(page.locator(".standings--compact")).toHaveCount(6);
  await knockout(page).click();
  await expectFixtures(page, [42]);
  await view(page).getByRole("button", { name: "Bracket", exact: true }).click();
  const rounds = page.getByRole("group", { name: "Bracket round", exact: true });
  await expect(rounds.getByRole("button")).toHaveCount(1);
  await expectFixtures(page, [42]);
  await selectTeam(page, "za");
  await expect(rounds.getByRole("button")).toHaveCount(4);
  await expectFixtures(page, [40]);
  for (const [label, id] of [["Quarter-finals", 45], ["Semi-finals", 49], ["Finals", 52]] as const) {
    await rounds.getByRole("button", { name: label, exact: true }).click();
    await expectFixtures(page, [id]);
  }
  await selectTeam(page, "ge");
  await expectFixtures(page, [42]);
  await expect(rounds.getByRole("button", { name: "Round of 16", exact: true })).toHaveAttribute("aria-pressed", "true");
  await selectTeam(page, "ro");
  await expect(page.locator(".fixture-card")).toHaveCount(0);
  await expect(rounds).toHaveCount(0);
  await expect(page.locator(".focus-empty")).toHaveText("Romania has no knockout matches in this prediction.");
  for (const layout of ["Rounds", "Timeline"]) {
    await view(page).getByRole("button", { name: layout, exact: true }).click();
    await expect(page.locator(".fixture-card")).toHaveCount(0);
    await expect(page.locator(".focus-empty")).toHaveText("Romania has no knockout matches in this prediction.");
  }
  expect(page.url()).toBe(filledUrl);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test("mobile focused details retain grouped undo, readable controls and hidden match navigation", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await page.goto("/");
  const blankUrl = page.url();
  await selectTeam(page, "za");
  const focusBounds = await focus(page).boundingBox();
  expect(focusBounds?.height).toBeGreaterThanOrEqual(44);
  const smallChoices = await page.locator(".winner-choice").evaluateAll((buttons) => buttons.filter((button) => button.getBoundingClientRect().height < 44).length);
  expect(smallChoices).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const trigger = card(page, 7).getByRole("button", { name: "Details for match 7", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Exact scores & bonus points", { exact: true }).click();
  await dialog.locator("#match-7-margin").fill("15");
  await dialog.locator("#match-7-homeScore").fill("35");
  await expect(dialog.locator("#match-7-homeScore")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(focus(page)).toHaveAttribute("data-team-id", "za");
  const editedUrl = page.url();
  await undo(page).click();
  expect(page.url()).toBe(blankUrl);
  await expect(undo(page)).toBeDisabled();
  await expectFixtures(page, poolB);
  await redo(page).click();
  expect(page.url()).toBe(editedUrl);
  await page.evaluate(() => {
    const target = new URL(location.href);
    target.searchParams.set("match", "1");
    history.pushState({}, "", target);
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(dialog).toBeVisible();
  await expect(focus(page)).toHaveAttribute("data-team-id", "");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(card(page, 1)).toBeVisible();
  await undo(page).click();
  expect(page.url()).toBe(blankUrl);
  await expect(undo(page)).toBeDisabled();
});

test("saved team focus survives tournament navigation and recovery within each tournament's fixtures", async ({ page }) => {
  await page.goto("/");
  await selectTeam(page, "za");
  await page.evaluate(() => {
    history.pushState({}, "", "/#predictions=v3.AoA");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByText("Legacy 2023 tournament", { exact: true })).toBeVisible();
  await expect(focus(page)).toHaveAttribute("data-team-id", "za");
  await expectTeamCount(page, 21);
  await expect(page.locator(".fixture-card")).toHaveCount(10);
  const legacyUrl = page.url();
  await expect(page.locator(".pool-section")).toHaveAttribute("data-pool-id", "B");
  await view(page).getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(page.locator(".fixture-card")).toHaveCount(10);
  await expect(page.locator(".standings--compact")).toHaveCount(1);
  await expect(page.getByRole("table", { name: "Pool B standings", exact: true })).toBeVisible();
  expect(page.url()).toBe(legacyUrl);
  await page.evaluate(() => {
    history.pushState({}, "", "/#predictions=broken");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(focus(page)).toHaveAttribute("data-team-id", "");
  await expect(focus(page)).toBeDisabled();
  expect(await page.evaluate((key) => localStorage.getItem(key), focusStorageKey)).toBe("za");
  await page.getByRole("button", { name: "Start fresh", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(focus(page)).toHaveAttribute("data-team-id", "za");
  await expect(focus(page)).toBeEnabled();
  await expectFixtures(page, poolB);
  await expect(undo(page)).toBeDisabled();
});

test("the flag picker supports keyboard selection and dismisses without changing predictions", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const blankUrl = page.url();
  const trigger = focus(page);
  const [triggerBounds, viewBounds, fillBounds] = await Promise.all([
    trigger.boundingBox(), view(page).boundingBox(), fill(page).boundingBox(),
  ]);
  expect(triggerBounds?.height).toBe(36);
  expect(viewBounds?.height).toBe(triggerBounds?.height);
  expect(fillBounds?.height).toBe(triggerBounds?.height);
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(trigger).toBeFocused();
  const options = focusTeams(page).getByRole("option");
  await expect(options).toHaveCount(25);
  await expect(options).toHaveText([
    "All teams", "Argentina", "Australia", "Canada", "Chile", "England", "Fiji", "France", "Georgia", "Hong Kong China",
    "Ireland", "Italy", "Japan", "New Zealand", "Portugal", "Romania", "Samoa", "Scotland", "South Africa", "Spain",
    "Tonga", "Uruguay", "USA", "Wales", "Zimbabwe",
  ]);
  await expect(focusTeams(page).locator(".team-flag")).toHaveCount(24);
  const allTeams = focusTeams(page).getByRole("option", { name: "All teams", exact: true });
  const southAfrica = focusTeams(page).getByRole("option", { name: "South Africa", exact: true });
  await expect(allTeams).toHaveAttribute("aria-selected", "true");
  await expect(southAfrica.locator(".team-flag")).toHaveAttribute("src", /flags\/4x3\/za\.svg$/);
  const optionIds = await options.evaluateAll((elements) => elements.map((element) => element.id));
  expect(optionIds.every(Boolean)).toBe(true);
  await trigger.press("End");
  await expect(trigger).toHaveAttribute("aria-activedescendant", optionIds[24]);
  await trigger.press("ArrowUp");
  await expect(trigger).toHaveAttribute("aria-activedescendant", optionIds[23]);
  await trigger.press("Home");
  await expect(trigger).toHaveAttribute("aria-activedescendant", optionIds[0]);
  await trigger.press("ArrowDown");
  await expect(trigger).toHaveAttribute("aria-activedescendant", optionIds[1]);
  await trigger.press("ArrowUp");
  await trigger.press("Enter");
  await expect(trigger).toHaveAttribute("data-team-id", "");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(focusTeams(page)).toHaveCount(0);

  await trigger.press("Space");
  await expect(focusTeams(page)).toBeVisible();
  for (const key of ["s", "o", "u"]) await trigger.press(key);
  await expect(trigger).toHaveAttribute("aria-activedescendant", await southAfrica.getAttribute("id") ?? "");
  await expect(allTeams).toHaveAttribute("aria-selected", "true");
  await trigger.press("Enter");
  await expect(trigger).toHaveAttribute("data-team-id", "za");
  await expect(trigger).toContainText("South Africa");
  await expect(trigger.locator(".team-flag")).toHaveAttribute("src", /flags\/4x3\/za\.svg$/);
  await expect.poll(() => trigger.locator(".team-flag").evaluate((element) => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0)).toBe(true);
  await expectFixtures(page, poolB);

  await trigger.click();
  await expect(southAfrica).toHaveAttribute("aria-selected", "true");
  await trigger.press("Home");
  await trigger.press("Escape");
  await expect(focusTeams(page)).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("data-team-id", "za");
  await expectFixtures(page, poolB);
  await trigger.click();
  await view(page).getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(focusTeams(page)).toHaveCount(0);
  await expect(trigger).toHaveAttribute("data-team-id", "za");
  await expectFixtures(page, poolB);

  await trigger.focus();
  await trigger.press("ArrowDown");
  await trigger.press("Home");
  await trigger.press("Space");
  await expect(trigger).toHaveAttribute("data-team-id", "");
  await expect(focusTeams(page)).toHaveCount(0);
  await expect(page.locator(".fixture-card")).toHaveCount(36);
  expect(page.url()).toBe(blankUrl);
  await expect(undo(page)).toBeDisabled();
});

test("team focus survives refresh and same-context tabs; All teams clears the local preference", async ({ page, context }) => {
  await page.goto("/");
  await card(page, 7).getByRole("button", { name: "South Africa", exact: true }).click();
  const pickedUrl = page.url();
  const historyLength = await page.evaluate(() => history.length);
  await selectTeam(page, "za");
  expect(await page.evaluate((key) => localStorage.getItem(key), focusStorageKey)).toBe("za");
  expect(page.url()).toBe(pickedUrl);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await expect(undo(page)).toBeEnabled();
  await page.reload();
  await expect(focus(page)).toHaveAttribute("data-team-id", "za");
  await expectFixtures(page, poolB);
  await expect(card(page, 7).getByRole("button", { name: "South Africa", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(undo(page)).toBeDisabled();
  expect(page.url()).toBe(pickedUrl);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);

  const tab = await context.newPage();
  await tab.route("**/api/shares?fingerprint=*", (route) => route.fulfill({ status: 404, json: { error: "Prediction link not found." } }));
  await tab.goto(pickedUrl);
  await expect(focus(tab)).toHaveAttribute("data-team-id", "za");
  await expectFixtures(tab, poolB);
  await selectTeam(tab, "");
  expect(await tab.evaluate((key) => localStorage.getItem(key), focusStorageKey)).toBeNull();
  expect(tab.url()).toBe(pickedUrl);
  await tab.close();
  await page.reload();
  await expect(focus(page)).toHaveAttribute("data-team-id", "");
  await expect(page.locator(".fixture-card")).toHaveCount(36);
  await expect(card(page, 7).getByRole("button", { name: "South Africa", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(page.url()).toBe(pickedUrl);
});

test("unavailable stored teams remain available to legacy links and match destinations outrank remembered focus", async ({ page }) => {
  await page.goto("/");
  await page.evaluate((key) => localStorage.setItem(key, "unknown-team"), focusStorageKey);
  await page.reload();
  await expect(focus(page)).toHaveAttribute("data-team-id", "");
  await expect(page.locator(".fixture-card")).toHaveCount(36);
  expect(await page.evaluate((key) => localStorage.getItem(key), focusStorageKey)).toBe("unknown-team");
  await page.evaluate((key) => localStorage.setItem(key, "na"), focusStorageKey);
  await page.reload();
  await expect(focus(page)).toHaveAttribute("data-team-id", "");
  expect(await page.evaluate((key) => localStorage.getItem(key), focusStorageKey)).toBe("na");
  await page.evaluate(() => {
    history.pushState({}, "", "/#predictions=v3.AoA");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(focus(page)).toHaveAttribute("data-team-id", "na");
  await expect(page.locator(".fixture-card")).toHaveCount(10);
  await expect(page.locator(".pool-section")).toHaveAttribute("data-pool-id", "A");
  await page.evaluate(() => {
    history.pushState({}, "", "/");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(focus(page)).toHaveAttribute("data-team-id", "");
  expect(await page.evaluate((key) => localStorage.getItem(key), focusStorageKey)).toBe("na");
  await selectTeam(page, "za");
  await page.goto("/?match=1");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Australia v Hong Kong China", exact: true })).toBeVisible();
  await expect(focus(page)).toHaveAttribute("data-team-id", "");
  expect(await page.evaluate((key) => localStorage.getItem(key), focusStorageKey)).toBe("za");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  expect(new URL(page.url()).searchParams.has("match")).toBe(false);
  await page.reload();
  await expect(focus(page)).toHaveAttribute("data-team-id", "za");
  await expectFixtures(page, poolB);
  await page.goto("/?match=7");
  await expect(dialog).toBeVisible();
  await expect(focus(page)).toHaveAttribute("data-team-id", "za");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
});

test("blocked preference storage leaves focus, prediction undo and full URL sharing usable", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((key) => {
    const calls = { get: 0, set: 0, remove: 0 };
    Reflect.set(window, "blockedFocusStorage", calls);
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    const remove = Storage.prototype.removeItem;
    Storage.prototype.getItem = function (this: Storage, name: string) {
      if (name === key) { calls.get++; throw new DOMException("Preference storage is blocked.", "SecurityError"); }
      return get.call(this, name);
    };
    Storage.prototype.setItem = function (this: Storage, name: string, value: string) {
      if (name === key) { calls.set++; throw new DOMException("Preference storage is blocked.", "SecurityError"); }
      set.call(this, name, value);
    };
    Storage.prototype.removeItem = function (this: Storage, name: string) {
      if (name === key) { calls.remove++; throw new DOMException("Preference storage is blocked.", "SecurityError"); }
      remove.call(this, name);
    };
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async (url: string) => { Reflect.set(window, "copiedFocusPredictionUrl", url); },
    } });
  }, focusStorageKey);
  await page.route("**/api/shares", (route) => route.fulfill({ status: 503, json: { error: "Short link storage is unavailable." } }));
  await page.goto("/");
  const blankUrl = page.url();
  await expect(focus(page)).toHaveAttribute("data-team-id", "");
  await selectTeam(page, "za");
  await expectFixtures(page, poolB);
  await card(page, 7).getByRole("button", { name: "South Africa", exact: true }).click();
  const pickedUrl = page.url();
  await selectTeam(page, "");
  await expect(page.locator(".fixture-card")).toHaveCount(36);
  await selectTeam(page, "za");
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await page.getByRole("dialog", { name: "Share predictions", exact: true })
    .getByRole("button", { name: "Copy URL - Share Full Tournament", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Reflect.get(window, "copiedFocusPredictionUrl"))).toBe(pickedUrl);
  expect(page.url()).toBe(pickedUrl);
  await expect(undo(page)).toBeEnabled();
  await undo(page).click();
  expect(page.url()).toBe(blankUrl);
  await expect(focus(page)).toHaveAttribute("data-team-id", "za");
  await expect(undo(page)).toBeDisabled();
  const calls = await page.evaluate(() => Reflect.get(window, "blockedFocusStorage"));
  expect(calls.get).toBeGreaterThan(0);
  expect(calls.set).toBeGreaterThan(0);
  expect(calls.remove).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
