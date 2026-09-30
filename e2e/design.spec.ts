import { expect, test, type Page } from "@playwright/test";

const card = (page: Page, id: number) => page.locator('[data-fixture-id="' + id + '"]');
const undo = (page: Page) => page.getByRole("button", { name: "Undo last prediction action" });
const redo = (page: Page) => page.getByRole("button", { name: "Redo prediction action" });
const dialog = (page: Page) => page.getByRole("dialog");
const view = (page: Page) => page.getByRole("group", { name: "View", exact: true });
const pools = (page: Page) => page.getByRole("button", { name: /\bPools\b/ });
const knockout = (page: Page) => page.getByRole("button", { name: /\bKnockout\b/ });

async function pickPools(page: Page, limit = 36): Promise<void> {
  for (let id = 1; id <= limit; id++) await card(page, id).locator(".winner-choice").first().click();
}

async function openDetails(page: Page, id: number): Promise<void> {
  await card(page, id).locator(".details-toggle").click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByText("Exact scores & bonus points", { exact: true }).click();
}

async function done(page: Page): Promise<void> {
  await dialog(page).getByRole("button", { name: "Done", exact: true }).click();
  await expect(dialog(page)).not.toBeVisible();
}

test("pool filters and views preserve the shared URL and prediction undo session", async ({ page }) => {
  await page.goto("/");
  await card(page, 1).getByRole("button", { name: "Australia", exact: true }).click();
  const pickedUrl = page.url();
  const historyLength = await page.evaluate(() => history.length);
  const poolBIds = await page.locator('[data-pool-id="B"] .fixture-card').evaluateAll((elements) => elements.map((element) => Number(element.getAttribute("data-fixture-id"))).sort((a, b) => a - b));
  await view(page).getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(page.locator(".fixture-card")).toHaveCount(36);
  expect(await page.locator("[data-date-key]").count()).toBeGreaterThan(1);
  const correctLocalDays = await page.locator("[data-date-key]").evaluateAll((days) => days.every((day) => [...day.querySelectorAll<HTMLTimeElement>(".fixture-meta time")].every((time) => {
    const kickoff = new Date(time.dateTime);
    const localDay = kickoff.getFullYear() + "-" + String(kickoff.getMonth() + 1).padStart(2, "0") + "-" + String(kickoff.getDate()).padStart(2, "0");
    return day.getAttribute("data-date-key") === localDay;
  })));
  expect(correctLocalDays).toBe(true);
  await page.getByRole("group", { name: "Pool filter", exact: true }).getByRole("button", { name: "B", exact: true }).click();
  await expect(page.locator(".fixture-card")).toHaveCount(6);
  expect(await page.locator(".fixture-card").evaluateAll((elements) => elements.map((element) => Number(element.getAttribute("data-fixture-id"))).sort((a, b) => a - b))).toEqual(poolBIds);
  await view(page).getByRole("button", { name: "By pool", exact: true }).click();
  await expect(page.locator(".pool-section")).toHaveCount(1);
  await expect(page.locator(".pool-section")).toHaveAttribute("data-pool-id", "B");
  expect(page.url()).toBe(pickedUrl);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await undo(page).click();
  expect(new URL(page.url()).hash).toBe("");
  await page.getByRole("group", { name: "Pool filter", exact: true }).getByRole("button", { name: "All", exact: true }).click();
  await expect(card(page, 1).getByRole("button", { name: "Australia", exact: true })).toHaveAttribute("aria-pressed", "false");
});

test("clicking the selected winner clears its entire pick and undo restores the details", async ({ page }) => {
  await page.goto("/");
  const australia = card(page, 1).getByRole("button", { name: "Australia", exact: true });
  await australia.click();
  await openDetails(page, 1);
  await dialog(page).locator("#match-1-margin").fill("15");
  await done(page);
  const detailedUrl = page.url();
  await australia.click();
  await expect(australia).toHaveAttribute("aria-pressed", "false");
  await expect(card(page, 1).locator(".result-preview strong")).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe("");
  await undo(page).click();
  expect(page.url()).toBe(detailedUrl);
  await expect(australia).toHaveAttribute("aria-pressed", "true");
  await openDetails(page, 1);
  await expect(dialog(page).locator("#match-1-margin")).toHaveValue("15");
  await done(page);
  await card(page, 1).getByRole("button", { name: "Draw", exact: true }).click();
  await expect(card(page, 1).getByRole("button", { name: "Draw", exact: true })).toHaveAttribute("aria-pressed", "true");
  await card(page, 1).getByRole("button", { name: "Draw", exact: true }).click();
  await expect(card(page, 1).locator(".result-preview strong")).toHaveCount(0);
});

test("knockout unlocks only after every valid pool result and conflict undo restores the bracket", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/");
  await expect(knockout(page)).toBeDisabled();
  await knockout(page).click({ force: true });
  await expect(pools(page)).toHaveAttribute("aria-pressed", "true");
  await pickPools(page, 35);
  await expect(knockout(page)).toBeDisabled();
  await card(page, 36).locator(".winner-choice").first().click();
  await expect(knockout(page)).toBeEnabled();
  await knockout(page).click();
  await expect(page.locator(".fixture-card")).toHaveCount(16);
  await expect(card(page, 45).locator(".winner-choice").first()).toBeDisabled();
  for (let id = 37; id <= 44; id++) await card(page, id).locator(".winner-choice").first().click();
  await card(page, 45).locator(".winner-choice").first().click();
  const bracketUrl = page.url();
  await pools(page).click();
  await openDetails(page, 1);
  await dialog(page).locator("#match-1-awayScore").fill("255");
  await done(page);
  await expect(card(page, 1).locator(".fixture-issues")).toBeVisible();
  await expect(knockout(page)).toBeDisabled();
  await undo(page).click();
  expect(page.url()).toBe(bracketUrl);
  await expect(knockout(page)).toBeEnabled();
  await knockout(page).click();
  await expect(card(page, 45).locator(".winner-choice").first()).toHaveAttribute("aria-pressed", "true");
  await expect(card(page, 45).locator(".result-preview strong")).toBeVisible();
});

test("desktop bracket pairs follow the actual dependency order rather than match numbers", async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await pickPools(page);
  await knockout(page).click();
  for (let id = 37; id <= 44; id++) await card(page, id).locator(".winner-choice").first().click();
  const teams38 = await card(page, 38).locator(".winner-choice .team-label").first().innerText();
  const teams40 = await card(page, 40).locator(".winner-choice .team-label").first().innerText();
  const url = page.url();
  await view(page).getByRole("button", { name: "Bracket", exact: true }).click();
  const round16 = page.locator('[data-bracket-stage="round16"]');
  const ids = await round16.locator(".fixture-card").evaluateAll((elements) => elements.map((element) => Number(element.getAttribute("data-fixture-id"))));
  expect(ids).toEqual([38, 40, 37, 39, 41, 42, 43, 44]);
  await expect(round16.locator('[data-next-fixture-id="45"] .fixture-card')).toHaveCount(2);
  const firstPair = await round16.locator('[data-next-fixture-id="45"] .fixture-card').evaluateAll((elements) => elements.map((element) => Number(element.getAttribute("data-fixture-id"))));
  expect(firstPair).toEqual([38, 40]);
  expect(await card(page, 45).locator(".winner-choice .team-label").first().innerText()).toBe(teams38);
  expect(await card(page, 45).locator(".winner-choice .team-label").last().innerText()).toBe(teams40);
  await expect(page.locator('[data-bracket-stage="quarter"] .fixture-card')).toHaveCount(4);
  await expect(page.locator('[data-bracket-stage="semi"] .fixture-card')).toHaveCount(2);
  await expect(page.locator('[data-bracket-stage="final"] .fixture-card')).toHaveCount(2);
  const semifinalFeeders = page.locator('[data-bracket-stage="semi"] [data-next-fixture-id="52"] .fixture-card');
  expect(await semifinalFeeders.evaluateAll((elements) => elements.map((element) => Number(element.getAttribute("data-fixture-id"))))).toEqual([49, 50]);
  const [semi49, semi50, final52] = await Promise.all([card(page, 49).boundingBox(), card(page, 50).boundingBox(), card(page, 52).boundingBox()]);
  if (!semi49 || !semi50 || !final52) throw new Error("Semifinal feeders and the final must have visible bracket cards.");
  const semifinalCenter = ((semi49.y + semi49.height / 2) + (semi50.y + semi50.height / 2)) / 2;
  expect(Math.abs(semifinalCenter - (final52.y + final52.height / 2))).toBeLessThanOrEqual(1);
  expect(page.url()).toBe(url);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test("mobile bracket shows one round at a time and Finals includes the bronze match", async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await pickPools(page);
  await knockout(page).click();
  await view(page).getByRole("button", { name: "Bracket", exact: true }).click();
  const rounds = page.getByRole("group", { name: "Bracket round", exact: true });
  await expect(page.locator(".fixture-card")).toHaveCount(8);
  await rounds.getByRole("button", { name: "Quarter-finals", exact: true }).click();
  await expect(page.locator(".fixture-card")).toHaveCount(4);
  await rounds.getByRole("button", { name: "Semi-finals", exact: true }).click();
  await expect(page.locator(".fixture-card")).toHaveCount(2);
  const url = page.url();
  await rounds.getByRole("button", { name: "Finals", exact: true }).click();
  await expect(page.locator(".fixture-card")).toHaveCount(2);
  await expect(card(page, 51)).toBeVisible();
  await expect(card(page, 52)).toBeVisible();
  await expect(card(page, 51).locator(".winner-choice").first()).toBeDisabled();
  expect(page.url()).toBe(url);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test("modal focus stays contained, Escape returns focus, and the whole editing session undoes together", async ({ page }) => {
  await page.goto("/");
  await card(page, 1).getByRole("button", { name: "Australia", exact: true }).click();
  const originalUrl = page.url();
  const trigger = card(page, 1).locator(".details-toggle");
  await openDetails(page, 1);
  expect(await dialog(page).evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await dialog(page).getByRole("button", { name: "Done", exact: true }).focus();
  await page.keyboard.press("Tab");
  // A native dialog permits Tab to browser chrome, while keeping the page inert.
  const tabFocus = await dialog(page).evaluate((element) => ({ inDialog: element.contains(document.activeElement), documentFocused: document.hasFocus() }));
  expect(tabFocus.inDialog || !tabFocus.documentFocused).toBe(true);
  if (!tabFocus.documentFocused) await page.keyboard.press("Tab");
  expect(await dialog(page).evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await dialog(page).locator("#match-1-margin").fill("15");
  await dialog(page).locator("#match-1-homeScore").fill("35");
  await dialog(page).locator("#match-1-homeTries").fill("4");
  await expect(dialog(page).locator("#match-1-homeTries")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await undo(page).click();
  expect(page.url()).toBe(originalUrl);
  await openDetails(page, 1);
  for (const field of ["margin", "homeScore", "homeTries"]) await expect(dialog(page).locator("#match-1-" + field)).toHaveValue("");
  await done(page);
  await redo(page).click();
  await openDetails(page, 1);
  await expect(dialog(page).locator("#match-1-margin")).toHaveValue("15");
  await expect(dialog(page).locator("#match-1-homeScore")).toHaveValue("35");
  await expect(dialog(page).locator("#match-1-homeTries")).toHaveValue("4");
});

test("opening details keeps a match unpicked; an explicit zero and Clear pick are reversible", async ({ page }) => {
  await page.goto("/");
  const blankUrl = page.url();
  await card(page, 1).locator(".details-toggle").click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).locator(".detail-advanced")).not.toHaveAttribute("open", "");
  await done(page);
  expect(page.url()).toBe(blankUrl);
  await expect(undo(page)).toBeDisabled();
  await card(page, 1).getByRole("button", { name: "Australia", exact: true }).click();
  const winnerUrl = page.url();
  await openDetails(page, 1);
  const margin = dialog(page).locator("#match-1-margin");
  const quickMargin = dialog(page).getByRole("group", { name: "Winning margin, match 1", exact: true });
  await quickMargin.getByRole("button", { name: "Draw", exact: true }).click();
  await expect(margin).toHaveValue("");
  await expect(margin).toHaveAttribute("placeholder", "0");
  await dialog(page).getByRole("group", { name: "Winner, match 1", exact: true }).getByRole("button", { name: "Australia", exact: true }).click();
  await expect(dialog(page).locator(".fixture-issues")).toHaveCount(0);
  await expect(margin).toHaveValue("");
  await expect(margin).toHaveAttribute("placeholder", "7");
  await expect(quickMargin.locator(".detail-label small")).toHaveText("Suggested 7");
  await done(page);
  expect(page.url()).toBe(winnerUrl);
  await card(page, 1).getByRole("button", { name: "Australia", exact: true }).click();
  expect(page.url()).toBe(blankUrl);
  await card(page, 1).locator(".details-toggle").click();
  await dialog(page).getByRole("group", { name: "Australia tries, match 1", exact: true }).getByRole("button", { name: "0", exact: true }).click();
  await done(page);
  await expect(card(page, 1).locator(".result-preview strong")).toBeVisible();
  const zeroUrl = page.url();
  await openDetails(page, 1);
  await dialog(page).locator("#match-1-margin").fill("15");
  const editedUrl = page.url();
  await dialog(page).getByRole("button", { name: /^Clear (?:pick|match)$/, exact: true }).click();
  await expect(dialog(page)).not.toBeVisible();
  await expect(card(page, 1).locator(".result-preview strong")).toHaveCount(0);
  await undo(page).click();
  expect(page.url()).toBe(editedUrl);
  await openDetails(page, 1);
  await expect(dialog(page).locator("#match-1-homeTries")).toHaveValue("0");
  await expect(dialog(page).locator("#match-1-margin")).toHaveValue("15");
  await done(page);
  await undo(page).click();
  expect(page.url()).toBe(zeroUrl);
  await openDetails(page, 1);
  await expect(dialog(page).locator("#match-1-homeTries")).toHaveValue("0");
  await expect(dialog(page).locator("#match-1-margin")).toHaveValue("");
});
