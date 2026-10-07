import { devices, expect, test, type Page } from "@playwright/test";

test.use({
  ...devices["iPhone 13"],
  browserName: "webkit",
  launchOptions: { executablePath: process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE_PATH },
});

const share = (page: Page) => page.getByRole("button", { name: "Share", exact: true });
const menu = (page: Page) => page.getByRole("dialog", { name: "Share predictions", exact: true });

test.beforeEach(async ({ page }) => {
  await page.route("**/api/shares?fingerprint=*", (route) => route.fulfill({ status: 404, json: { error: "Prediction link not found." } }));
});

test("iPhone touch selection opens the focused pool infographic and keeps local predictions", async ({ page }) => {
  await page.goto("/");
  const focus = page.getByRole("combobox", { name: "Focus", exact: true });
  await focus.tap();
  await page.getByRole("listbox", { name: "Focus teams", exact: true }).getByRole("option")
    .and(page.locator('[data-team-id="za"]')).tap();
  await expect(focus).toHaveAttribute("data-team-id", "za");
  await page.locator('[data-fixture-id="7"]').getByRole("button", { name: "South Africa", exact: true }).tap();
  const pickedUrl = page.url();
  const historyLength = await page.evaluate(() => history.length);

  await share(page).tap();
  await expect(menu(page).getByRole("button", { name: "Copy URL - Share Full Tournament", exact: true })).toBeFocused();
  // Some Safari versions clear button focus before delivering a tap's click.
  // Exercise that sequence as well as WebKit's normal touch activation below.
  await menu(page).getByRole("button", { name: "Copy URL - Share Full Tournament", exact: true })
    .evaluate((element) => { (element as HTMLButtonElement).blur(); });
  await expect(menu(page)).toBeVisible();
  await menu(page).getByRole("button", { name: "Share Pool Matches - South Africa", exact: true }).tap();
  const poster = page.getByRole("dialog", { name: "Pool match infographic", exact: true });
  await expect(poster).toBeVisible();
  await expect(poster.getByRole("img")).toBeVisible();
  await expect(poster.getByRole("button", { name: /^Download (PNG|SVG)$/ })).toBeEnabled();
  expect(page.url()).toBe(pickedUrl);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await poster.getByRole("button", { name: "Close pool match infographic", exact: true }).tap();
  await expect(poster).toHaveCount(0);
  await expect(share(page)).toBeFocused();
  await page.getByRole("button", { name: "Undo last prediction action", exact: true }).tap();
  await expect(page.locator('[data-fixture-id="7"]').getByRole("button", { name: "South Africa", exact: true }))
    .toHaveAttribute("aria-pressed", "false");
});

test("iPhone touch activates full tournament sharing after the menu moves keyboard focus", async ({ page }) => {
  await page.addInitScript(() => {
    const copied: string[] = [];
    Object.defineProperty(window, "__iPhoneCopied", { value: copied });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (value: string) => { copied.push(value); } },
    });
  });
  await page.route("**/api/shares", (route) => route.fulfill({ status: 503, json: { error: "Sharing unavailable." } }));
  await page.goto("/");
  await page.locator('[data-fixture-id="1"]').getByRole("button", { name: "Australia", exact: true }).tap();
  const pickedUrl = page.url();
  await share(page).tap();
  const copy = menu(page).getByRole("button", { name: "Copy URL - Share Full Tournament", exact: true });
  await expect(copy).toBeFocused();
  await copy.tap();
  await expect.poll(() => page.evaluate(() => (window as Window & { __iPhoneCopied?: string[] }).__iPhoneCopied)).toEqual([pickedUrl]);
  await expect(menu(page)).toHaveCount(0);
  expect(page.url()).toBe(pickedUrl);
  await expect(page.getByRole("button", { name: "Undo last prediction action", exact: true })).toBeEnabled();
});
