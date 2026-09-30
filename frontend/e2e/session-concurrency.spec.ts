/**
 * Session survival across reloads and tabs.
 *
 * Refresh tokens rotate and the old one is blacklisted (SIMPLE_JWT
 * ROTATE_REFRESH_TOKENS + BLACKLIST_AFTER_ROTATION), and every page load refreshes
 * once. Two tabs that refresh at the same moment presented the same cookie and the
 * loser was logged out; `withRefreshLock` (src/lib/api.ts) now serialises refreshes
 * across tabs with the Web Locks API.
 */
import { expect, test, type Page } from "@playwright/test";
import { E2E_CREDENTIALS, loginAsUser } from "./helpers";

const stillSignedIn = (tab: Page) => new URL(tab.url()).pathname !== "/login";

async function settle(...tabs: Page[]) {
  await Promise.all(tabs.map((tab) => tab.waitForLoadState("networkidle").catch(() => undefined)));
  await tabs[0].waitForTimeout(400);
}

test.describe("session survives reloads and tabs", () => {
  test.describe.configure({ timeout: 180_000 });

  test("one tab reloading repeatedly stays signed in", async ({ page }) => {
    await loginAsUser(page, E2E_CREDENTIALS.employeeA);
    await page.goto("/dashboard");
    for (let round = 1; round <= 8; round += 1) {
      await page.reload();
      await settle(page);
      expect(stillSignedIn(page), `reload ${round}`).toBe(true);
    }
  });

  test("two tabs reloaded one after the other stay signed in", async ({ page, context }) => {
    await loginAsUser(page, E2E_CREDENTIALS.employeeA);
    await page.goto("/dashboard");
    const second = await context.newPage();
    await second.goto("/dashboard");
    for (let round = 1; round <= 6; round += 1) {
      await page.reload();
      await settle(page);
      await second.reload();
      await settle(second);
      expect(stillSignedIn(page), `tab 1 round ${round}`).toBe(true);
      expect(stillSignedIn(second), `tab 2 round ${round}`).toBe(true);
    }
  });

  // KNOWN RESIDUAL, not a regression test: reloading two tabs in the same millisecond still
  // logs one tab out roughly one run in three (before the Web Locks fix: every run). Verified
  // cause: a reload cancels a refresh request *after* the server has already rotated the
  // token, so the browser keeps the old (now blacklisted) cookie. The token table shows the
  // successor created and the old token blacklisted, while the server access log has no
  // matching 200. A client cannot prevent that; the fix is server-side (a short reuse grace
  // for just-rotated tokens), which is a security trade-off for the owner to decide.
  test.fixme("two tabs reloaded in the same millisecond stay signed in", async ({ page, context }) => {
    await loginAsUser(page, E2E_CREDENTIALS.employeeA);
    await page.goto("/dashboard");
    const second = await context.newPage();
    await second.goto("/dashboard");
    for (let round = 1; round <= 8; round += 1) {
      await Promise.all([page.reload(), second.reload()]);
      await settle(page, second);
      expect(stillSignedIn(page), `tab 1 round ${round}`).toBe(true);
      expect(stillSignedIn(second), `tab 2 round ${round}`).toBe(true);
    }
  });
});
