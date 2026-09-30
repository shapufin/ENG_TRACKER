import { expect, test } from "@playwright/test";
import { E2E_CREDENTIALS, loginAsUser } from "./helpers";

test.describe("Personal offline data", () => {
  test("shows user-scoped saved data as stale while offline", async ({ page }) => {
    await loginAsUser(page, E2E_CREDENTIALS.employeeA);
    await page.goto("/overtime");
    await expect(page.getByRole("heading", { name: "Overtime" })).toBeVisible();

    // The online GET is cached by the allowlisted personal API cache. The service worker
    // caches the hashed bundles at runtime, so reload once under its control first.
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await page.reload();
    await expect(page.getByRole("heading", { name: "Overtime" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.context().setOffline(true);
    // Emulated offline mode blocks the network but the new document still reports
    // navigator.onLine === true, and the auth bootstrap only restores the saved session
    // when it is false (as a real browser in airplane mode does).
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "onLine", { get: () => false, configurable: true });
    });
    await page.reload();

    await expect(page.getByText(/Showing saved data from your last connection/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Overtime" })).toBeVisible();
  });

  test("does not expose team data through the personal cache", async ({ page }) => {
    await loginAsUser(page, E2E_CREDENTIALS.employeeA);
    await page.goto("/overtime");
    await expect(page.getByRole("heading", { name: "Overtime" })).toBeVisible();

    const cachedKeys = await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.includes("offline-api"))
    );
    expect(
      cachedKeys.every((key) => !key.includes("team_logs") && !key.includes("team_pending"))
    ).toBe(true);
  });
});
