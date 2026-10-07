import { expect, test, type Locator, type Page } from "@playwright/test";

const widths = [320, 360, 375, 390, 399, 400, 414];
const stages = (page: Page) => page.getByRole("navigation", { name: "Tournament stages", exact: true });
const pools = (page: Page) => stages(page).getByRole("button", { name: /\bPools\b/ });
const knockout = (page: Page) => stages(page).getByRole("button", { name: /\bKnockout\b/ });
const undo = (page: Page) => page.getByRole("button", { name: "Undo last prediction action", exact: true });
const redo = (page: Page) => page.getByRole("button", { name: "Redo prediction action", exact: true });
const reset = (page: Page) => page.getByRole("button", { name: "Reset all picks", exact: true });
const share = (page: Page) => page.getByRole("button", { name: "Share", exact: true });
const settings = (page: Page) => page.getByRole("button", { name: "Settings", exact: true });
const help = (page: Page) => page.getByRole("button", { name: "How does it work?", exact: true });
const shareMenu = (page: Page) => page.getByRole("dialog", { name: "Share predictions", exact: true });
const settingsMenu = (page: Page) => page.getByRole("dialog", { name: "Settings", exact: true });

test.beforeEach(async ({ page }) => {
  await page.route("**/api/shares?fingerprint=*", (route) => route.fulfill({ status: 404, json: { error: "Prediction link not found." } }));
});

async function bounds(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("The header control must be visible.");
  return box;
}

async function expectHeaderFits(page: Page, width: number): Promise<void> {
  const usableWidth = await page.evaluate(() => document.documentElement.clientWidth);
  const controls = [undo(page), redo(page), reset(page), share(page), settings(page), help(page)];
  const [brand, navigation, ...buttons] = await Promise.all([
    bounds(page.locator(".wordmark")), bounds(stages(page)), ...controls.map(bounds),
  ]);
  for (const box of [brand, navigation, ...buttons]) {
    expect(box.x, `Header left edge at ${width}px`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `Header right edge within ${usableWidth}px usable width at ${width}px`).toBeLessThanOrEqual(usableWidth + 1);
  }
  for (const box of buttons) {
    expect(box.height, `Header target height at ${width}px`).toBeGreaterThanOrEqual(44);
    expect(box.width, `Header target width at ${width}px`).toBeGreaterThanOrEqual(width < 400 ? 44 : 32);
  }
  const helpBox = buttons[5];
  if (width < 400) {
    expect(brand.y + brand.height, `Brand must precede actions at ${width}px`).toBeLessThanOrEqual(buttons[0].y);
    for (const box of buttons) {
      expect(Math.abs(box.y + box.height / 2 - (helpBox.y + helpBox.height / 2)), `Actions must share a row at ${width}px`).toBeLessThanOrEqual(1);
    }
    for (let index = 1; index < buttons.length; index++) {
      expect(buttons[index - 1].x + buttons[index - 1].width, `Header targets must not overlap at ${width}px`).toBeLessThanOrEqual(buttons[index].x + 1);
    }
    expect(navigation.y, `Stages must follow actions at ${width}px`).toBeGreaterThanOrEqual(helpBox.y + helpBox.height);
    expect(Math.abs(brand.x - navigation.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(brand.x + brand.width - (navigation.x + navigation.width)), `Brand and stages must use the full row at ${width}px`).toBeLessThanOrEqual(1);
  } else {
    expect(Math.abs(navigation.y + navigation.height / 2 - (helpBox.y + helpBox.height / 2)), `The existing stages and help row must remain at ${width}px`).toBeLessThanOrEqual(1);
  }
  for (const stage of [pools(page), knockout(page)]) {
    const box = await bounds(stage);
    expect(box.x).toBeGreaterThanOrEqual(navigation.x - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(navigation.x + navigation.width + 1);
    expect(await stage.evaluate((element) => element.scrollWidth - element.clientWidth), `Stage contents must fit at ${width}px`).toBeLessThanOrEqual(1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `The page must not scroll horizontally at ${width}px`).toBeLessThanOrEqual(1);
}

async function expectPopoverFits(page: Page, popover: Locator, width: number): Promise<void> {
  const usableWidth = await page.evaluate(() => document.documentElement.clientWidth);
  const [box, brand] = await Promise.all([bounds(popover), bounds(page.locator(".wordmark"))]);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(usableWidth + 1);
  if (width < 400) {
    expect(box.x).toBeGreaterThanOrEqual(brand.x - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(brand.x + brand.width + 1);
  }
  expect(await popover.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

async function expectPopoversUsable(page: Page, width: number): Promise<void> {
  await share(page).focus();
  await share(page).press("Enter");
  await expect(shareMenu(page)).toBeVisible();
  const copy = shareMenu(page).getByRole("button", { name: "Copy URL - Share Full Tournament", exact: true });
  await expect(copy).toBeFocused();
  await expectPopoverFits(page, shareMenu(page), width);
  await expect(shareMenu(page).getByRole("button", { name: "Share Pool Matches", exact: true })).toBeDisabled();
  await copy.press("Escape");
  await expect(shareMenu(page)).toHaveCount(0);
  await expect(share(page)).toBeFocused();

  await settings(page).press("Space");
  await expect(settingsMenu(page)).toBeVisible();
  const timezone = settingsMenu(page).getByRole("combobox", { name: "Timezone", exact: true });
  await expect(timezone).toBeFocused();
  await expectPopoverFits(page, settingsMenu(page), width);
  await timezone.press("Escape");
  await expect(settingsMenu(page)).toHaveCount(0);
  await expect(settings(page)).toBeFocused();
}

test("small headers keep complete stages, six actions and their popovers usable across the micro breakpoint", async ({ page }) => {
  const errors: string[] = [];
  const writes: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname.startsWith("/api/")) writes.push(request.url());
  });
  await page.goto("/");
  const blankUrl = page.url();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 812 });
    await expectHeaderFits(page, width);
    await expect(pools(page)).toContainText("0/36");
    await expect(knockout(page)).toHaveAttribute("aria-disabled", "true");
  }

  await page.getByRole("button", { name: "Fill unpicked matches", exact: true }).click();
  const filledUrl = page.url();
  const historyLength = await page.evaluate(() => history.length);
  await page.evaluate(() => scrollTo(0, 0));
  for (const width of widths) {
    await page.setViewportSize({ width, height: 812 });
    await expectHeaderFits(page, width);
    await expect(pools(page)).toContainText("36/36");
    await expect(knockout(page)).toContainText("16/16");
    await expect(knockout(page)).toHaveAttribute("aria-disabled", "false");

    await expectPopoversUsable(page, width);
    expect(page.url()).toBe(filledUrl);
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
  }

  await page.setViewportSize({ width: 320, height: 812 });
  const previousGutter = await page.evaluate(() => {
    const previous = document.documentElement.style.scrollbarGutter;
    document.documentElement.style.scrollbarGutter = "stable";
    return previous;
  });
  try {
    await expectHeaderFits(page, 320);
    await expectPopoversUsable(page, 320);
    expect(page.url()).toBe(filledUrl);
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
  } finally {
    await page.evaluate((gutter) => { document.documentElement.style.scrollbarGutter = gutter; }, previousGutter);
  }

  for (const width of [320, 400]) {
    await page.setViewportSize({ width, height: 812 });
    const focus = page.getByRole("combobox", { name: "Focus", exact: true });
    await focus.click();
    await page.getByRole("listbox", { name: "Focus teams", exact: true }).getByRole("option")
      .and(page.locator('[data-team-id="za"]')).click();
    await share(page).click();
    await shareMenu(page).getByRole("button", { name: "Share Pool Matches - South Africa", exact: true }).click();
    const infographic = page.getByRole("dialog", { name: "Pool match infographic", exact: true });
    await expect(infographic).toBeVisible();
    await infographic.getByRole("button", { name: "Close pool match infographic", exact: true }).click();
    await expect(infographic).toHaveCount(0);
    await expect(share(page)).toBeFocused();

    await settings(page).click();
    await settingsMenu(page).getByRole("combobox", { name: "Timezone", exact: true }).selectOption("UTC");
    await page.locator(".wordmark").click();
    await expect(settingsMenu(page)).toHaveCount(0);
    await help(page).click();
    const helpDialog = page.getByRole("dialog", { name: "How does it work?", exact: true });
    await expect(helpDialog).toBeVisible();
    await helpDialog.getByRole("button", { name: "Got it", exact: true }).click();
    await expect(helpDialog).toHaveCount(0);
    await expect(help(page)).toBeFocused();
    await knockout(page).click();
    await expect(knockout(page)).toHaveAttribute("aria-pressed", "true");
    await pools(page).click();
    await expect(pools(page)).toHaveAttribute("aria-pressed", "true");
    expect(page.url()).toBe(filledUrl);
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    await undo(page).click();
    expect(page.url()).toBe(blankUrl);
    await expect(redo(page)).toBeEnabled();
    await redo(page).click();
    expect(page.url()).toBe(filledUrl);
  }
  await reset(page).click();
  expect(page.url()).toBe(blankUrl);
  await expect(undo(page)).toBeEnabled();
  await undo(page).click();
  expect(page.url()).toBe(filledUrl);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
