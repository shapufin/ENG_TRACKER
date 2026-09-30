import { expect, test } from "@playwright/test";

test.describe("Engineering Tracker PWA", () => {
  test("serves an installable manifest", async ({ page, request }) => {
    await page.goto("/");
    const response = await request.get("/manifest.json");
    expect(response.ok()).toBeTruthy();
    const manifest = await response.json();
    expect(manifest.name).toBe("Engineering Tracker");
    expect(manifest.display).toBe("standalone");
    expect(manifest.scope).toBe("/");
    expect(manifest.orientation).toBeUndefined();
    expect(manifest.theme_color).toBe("#3857e6");
    expect(manifest.background_color).toBe("#f8fafc");
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192", type: "image/png" }),
        expect.objectContaining({ sizes: "512x512", type: "image/png" }),
      ])
    );
  });

  test("contains push and safe notification-click handlers", async ({ request }) => {
    const response = await request.get("/sw.js");
    const source = await response.text();
    expect(source).toContain('self.addEventListener("push"');
    expect(source).toContain('self.addEventListener("notificationclick"');
    expect(source).toContain("target.origin === self.location.origin");
  });

  test("registers the service worker", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    const registration = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return {
        active: registration.active?.scriptURL,
        scope: registration.scope,
      };
    });
    expect(registration.active).toContain("/sw.js");
    expect(registration.scope).toBe("http://127.0.0.1:5173/");
  });

  test("loads the cached app shell while offline (returning visitor)", async ({ page, context }) => {
    // sw.js precaches the shell list at install but caches the hashed JS/CSS at runtime, so a
    // brand-new visitor's first load is not yet cached. Model a returning visitor: load once
    // under the worker's control so the bundles are cached, then go offline.
    await page.goto("/");
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await page.reload();
    await page.waitForLoadState("networkidle");
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator("#root")).toBeVisible();
    await expect(page.locator("#root")).not.toBeEmpty();
    await context.setOffline(false);
  });

  test("serves SPA deep links via index.html fallback", async ({ page }) => {
    // A client-side route that does not exist as a static file should still
    // resolve via the SPA fallback (nginx try_files / Vite middleware).
    const response = await page.goto("/overtime");
    expect(response?.status()).toBe(200);
    await expect(page.locator("#root")).toBeVisible();
    // The app booted and routed client-side. Unauthenticated visitors are then sent to /login by
    // ProtectedRoute; what matters here is that the server did not 404 the deep link.
    await page.waitForURL((url) => ["/overtime", "/login"].includes(url.pathname));
  });

  test("serves the service worker at the expected scope", async ({ request }) => {
    const response = await request.get("/sw.js");
    expect(response.ok()).toBeTruthy();
    expect(response.headers()["content-type"]).toMatch(/javascript|text\/plain/);
  });

  test("manifest icons are reachable", async ({ request }) => {
    const manifestResponse = await request.get("/manifest.json");
    const manifest = await manifestResponse.json();
    for (const icon of manifest.icons) {
      const iconResponse = await request.get(icon.src);
      expect(iconResponse.ok()).toBeTruthy();
      expect(iconResponse.headers()["content-type"]).toBe("image/png");
    }
  });
});
