import { expect, test, type APIResponse } from "@playwright/test";

const navigationHeaders = {
  Accept: "text/html",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Dest": "document",
};
const legacyPayload = Buffer.from([48, 1, 0, 0, 0, 0, 0, 255, 255, 255]).toString("base64");
const legacyPath = `/${legacyPayload}?deployment=legacy`;

function expectRevalidation(response: APIResponse): void {
  const cache = response.headers()["cache-control"] ?? "";
  expect(cache).toMatch(/(?:^|,)\s*max-age=0(?:\s*,|$)/);
  expect(cache).toMatch(/(?:^|,)\s*must-revalidate(?:\s*,|$)/);
  expect(cache).not.toMatch(/(?:^|,)\s*immutable(?:\s*,|$)/);
}

for (const [path, tournament, poolCount] of [
  ["/?deployment=root", "2027", 36],
  ["/index.html?deployment=index", "2027", 36],
  [legacyPath, "2023", 40],
] as const) {
  test(`static hosting serves ${tournament} navigation at ${path} without redirecting the shared URL`, async ({ page, request, baseURL }) => {
    const expectedUrl = new URL(path, baseURL).href;
    const http = await request.get(path, { headers: navigationHeaders, maxRedirects: 0 });
    expect(http.status()).toBe(200);
    expect(http.url()).toBe(expectedUrl);
    expect(http.headers().location).toBeUndefined();
    expect(http.headers()["content-type"]).toMatch(/^text\/html(?:;|$)/);
    expect(await http.text()).toContain('id="root"');
    expectRevalidation(http);

    const navigation = await page.goto(path);
    expect(navigation?.status()).toBe(200);
    expect(navigation?.request().redirectedFrom()).toBeNull();
    await expect(page.locator(".fixture-card")).toHaveCount(poolCount);
    if (tournament === "2023") {
      expect(legacyPayload).toContain("/");
      await expect(page.locator(".eyebrow")).toHaveText("Legacy 2023 tournament");
      await expect(page.locator('[data-fixture-id="1"] .result-preview strong')).toHaveText("255 – 255");
    }
    expect(page.url()).toBe(expectedUrl);
  });
}

test("plain GET and HEAD requests serve entry points and Accept-based legacy links without redirects", async ({ request }) => {
  for (const path of ["/", "/index.html", legacyPath]) {
    for (const method of ["GET", "HEAD"]) {
      const response = await request.fetch(path, {
        method,
        headers: path === legacyPath ? { Accept: "text/html" } : {},
        maxRedirects: 0,
      });
      expect(response.status()).toBe(200);
      expect(response.headers().location).toBeUndefined();
      expect(response.headers()["content-type"]).toMatch(/^text\/html(?:;|$)/);
      expectRevalidation(response);
      if (method === "HEAD") expect(await response.body()).toHaveLength(0);
      else expect(await response.text()).toContain('id="root"');
    }
  }
});

test("the HTML shell requires revalidation instead of immutable asset caching", async ({ request }) => {
  const response = await request.get("/index.html", { headers: navigationHeaders, maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expectRevalidation(response);
  const html = await response.text();
  expect(html).toContain('id="root"');
  const etag = response.headers().etag;
  if (!process.env.BASE_URL) expect(etag).toBeTruthy();
  const repeated = await request.get("/index.html", {
    headers: { ...navigationHeaders, ...(etag ? { "If-None-Match": etag } : {}) }, maxRedirects: 0,
  });
  if (etag) {
    expect(repeated.status()).toBe(304);
    expect(await repeated.body()).toHaveLength(0);
  } else {
    expect(repeated.status()).toBe(200);
    expectRevalidation(repeated);
    expect(await repeated.text()).toBe(html);
  }
});

test("the actual generated JavaScript and CSS have correct MIME types and immutable caching", async ({ page, request }) => {
  await page.goto("/");
  const assets = await page.locator('script[type="module"][src], link[rel="stylesheet"][href]').evaluateAll((elements) =>
    elements.map((element) => element instanceof HTMLScriptElement ? element.src : (element as HTMLLinkElement).href)
      .filter((url) => {
        const asset = new URL(url);
        return asset.origin === location.origin && asset.pathname.startsWith("/assets/");
      }));
  expect(assets.some((url) => new URL(url).pathname.endsWith(".js"))).toBe(true);
  expect(assets.some((url) => new URL(url).pathname.endsWith(".css"))).toBe(true);
  for (const url of assets) {
    const pathname = new URL(url).pathname;
    expect(pathname).toMatch(/^\/assets\/[^/]+-[A-Za-z0-9_-]{6,}\.(?:js|css)$/);
    const response = await request.get(url, { headers: { "Sec-Fetch-Mode": "cors" }, maxRedirects: 0 });
    expect(response.status()).toBe(200);
    const mime = response.headers()["content-type"];
    expect(mime).toMatch(pathname.endsWith(".css") ? /^text\/css(?:;|$)/ : /^(?:text|application)\/javascript(?:;|$)/);
    const cache = response.headers()["cache-control"] ?? "";
    expect(cache).toMatch(/(?:^|,)\s*public(?:\s*,|$)/);
    expect(cache).toMatch(/(?:^|,)\s*max-age=31536000(?:\s*,|$)/);
    expect(cache).toMatch(/(?:^|,)\s*immutable(?:\s*,|$)/);
    const body = await response.text();
    expect(body.length).toBeGreaterThan(0);
    expect(body).not.toMatch(/^\s*<!doctype html/i);
  }
});

test("unversioned flags are SVG assets with revalidation caching", async ({ request }) => {
  const response = await request.get("/flags/4x3/au.svg", { headers: { "Sec-Fetch-Mode": "cors" }, maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/^image\/svg\+xml(?:;|$)/);
  expect(await response.text()).toMatch(/<svg(?:\s|>)/);
  expectRevalidation(response);
});

test("missing subresources return 404 instead of the SPA HTML shell", async ({ request, page }) => {
  for (const path of ["/assets/deployment-missing.js", "/flags/4x3/deployment-missing.svg"]) {
    const response = await request.get(path, {
      headers: { Accept: "*/*", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Dest": path.endsWith(".js") ? "script" : "image" },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(404);
    expect(response.headers()["content-type"] ?? "").not.toMatch(/^text\/html(?:;|$)/);
    expect(await response.text()).not.toContain('id="root"');
  }
  await page.goto("/");
  const response = await page.evaluate(async () => {
    const missing = await fetch("/assets/deployment-missing.js");
    return { status: missing.status, mime: missing.headers.get("content-type"), body: await missing.text() };
  });
  expect(response.status).toBe(404);
  expect(response.mime ?? "").not.toMatch(/^text\/html(?:;|$)/);
  expect(response.body).not.toContain('id="root"');
});
