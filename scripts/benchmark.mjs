import { chromium } from "@playwright/test";

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  const requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requests.push({ url: request.url(), type: request.resourceType() }));
  const baseUrl = process.env.BENCHMARK_URL ?? "http://127.0.0.1:4173/";
  await page.goto(baseUrl);
  await page.locator(".fixture-card").first().waitFor();
  const client = await page.context().newCDPSession(page);
  const measured = [];

  for (const cpuThrottle of [1, 4]) {
    await client.send("Emulation.setCPUThrottlingRate", { rate: cpuThrottle });
    const requestStart = requests.length;
    const timing = await page.evaluate(async () => {
      const action = [];
      const paintOpportunity = [];
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const measure = async (change) => {
        const start = performance.now();
        change();
        action.push(performance.now() - start);
        await nextFrame(); // Includes at least one paint opportunity, not paint instrumentation.
        paintOpportunity.push(performance.now() - start);
      };
      for (const card of document.querySelectorAll(".pool-section .fixture-card")) {
        await measure(() => card.querySelector(".winner-choice").click());
      }
      document.querySelectorAll(".view-nav button")[1].click();
      for (const card of document.querySelectorAll(".knockout-view .fixture-card")) {
        await measure(() => card.querySelector(".winner-choice").click());
      }
      const final = document.querySelector('[data-fixture-id="52"]');
      final.querySelector(".details-toggle").click();
      const input = final.querySelector('input[name="homeScore"]');
      for (let n = 0; n < 30; n++) {
        await measure(() => {
          input.value = String(24 + n % 7);
          input.dispatchEvent(new Event("input", { bubbles: true }));
        });
      }
      const summarize = (values) => {
        const sorted = values.toSorted((a, b) => a - b);
        return {
          samples: values.length,
          medianMs: +sorted[Math.floor(sorted.length / 2)].toFixed(2),
          p95Ms: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
          maxMs: +sorted.at(-1).toFixed(2),
        };
      };
      return {
        synchronousAction: summarize(action),
        nextPaintOpportunity: summarize(paintOpportunity),
        urlCharacters: location.href.length,
        knockoutResults: document.querySelectorAll(".knockout-view .result-preview strong").length,
      };
    });
    const editRequests = requests.slice(requestStart);
    measured.push({
      cpuThrottle,
      ...timing,
      externalEditRequests: editRequests.filter((request) => new URL(request.url).origin !== new URL(baseUrl).origin).length,
      fetchOrXhrEditRequests: editRequests.filter((request) => ["fetch", "xhr"].includes(request.type)).length,
    });
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await page.getByRole("button", { name: /^Pools/ }).click();
  }
  console.log(JSON.stringify({ browser: browser.version(), viewport: "1440x1100", measured, errors }, null, 2));
} finally {
  await browser.close();
}
