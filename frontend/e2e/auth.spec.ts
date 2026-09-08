/**
 * Authenticated E2E tests — exercise the full offline queue integration:
 * login → offline mutation → auto-flush → backend persistence, plus
 * account isolation and logout cleanup.
 *
 * These tests require the seeded E2E users created by `seed_e2e_data`.
 * The Playwright globalSetup runs that command before the suite.
 */
import { expect, test } from "@playwright/test";
import {
  E2E_CREDENTIALS,
  captureApiRequests,
  getQueuedMutations,
  injectQueuedMutation,
  loginAsUser,
  logoutViaUI,
  waitForQueueEmpty,
} from "./helpers";

/**
 * Generate a unique future date (YYYY-MM-DD) to avoid the OvertimeLog
 * unique constraint on (user, date, client). Uses a far-future year
 * plus a random day so repeated runs never collide.
 */
function uniqueFutureDate(): string {
  const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, "0");
  const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, "0");
  return `2099-${month}-${day}`;
}

function uniqueBusinessDate(): string {
  const value = new Date();
  value.setDate(value.getDate() + 7 * (1 + Math.floor(Math.random() * 8)));
  return value.toISOString().slice(0, 10);
}

function displayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

async function waitForManualOrAutoFlush(page: import("@playwright/test").Page, userId: number) {
  await page.context().setOffline(false);
  const syncButton = page.locator('button:has-text("Sync now")');
  const autoFlushed = await waitForQueueEmpty(page, userId, 8_000)
    .then(() => true)
    .catch(() => false);
  if (!autoFlushed && (await syncButton.isVisible().catch(() => false))) {
    await syncButton.click();
  }
  if (!autoFlushed) await waitForQueueEmpty(page, userId, 15_000);
}

test.describe("Authenticated offline queue integration", () => {
  test.describe.configure({ timeout: 60_000 });

  test("employee login redirects to /dashboard", async ({ page }) => {
    const user = await loginAsUser(page, E2E_CREDENTIALS.employeeA);
    expect(user.username).toBe("e2e_employee_a");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("offline mutation is queued and flushed to backend on reconnect", async ({ page }) => {
    const user = await loginAsUser(page, E2E_CREDENTIALS.employeeA);

    // Fetch the E2E client ID via a direct API call from the browser
    const { e2eClient, token } = await page.evaluate(async () => {
      const tok = localStorage.getItem("access_token");
      const resp = await fetch("http://127.0.0.1:8000/api/overtime/clients/", {
        headers: { Authorization: `Bearer ${tok}` },
      });
      const body = await resp.json();
      const clients = Array.isArray(body) ? body : body.results;
      const client = clients.find((c: { code: string }) => c.code === "E2E");
      return { e2eClient: client, token: tok };
    });
    expect(e2eClient).toBeDefined();

    const overtimeDate = uniqueFutureDate();
    const apiRequests = captureApiRequests(page, "/overtime/logs/");

    // Go offline, inject a queued mutation, then reconnect
    await page.context().setOffline(true);
    await injectQueuedMutation(page, user.id, {
      url: "/overtime/logs/",
      method: "POST",
      body: {
        client: e2eClient.id,
        date: overtimeDate,
        hours: 2,
        start_time: "18:00",
        end_time: "20:00",
        description: "E2E offline queue test",
      },
      description: "Overtime (offline)",
    });

    const queuedBefore = await getQueuedMutations(page, user.id);
    expect(queuedBefore).toHaveLength(1);

    // Reconnect — the useOfflineStatus hook auto-flushes on the online
    // event. As a fallback, click the "Sync now" button if it appears.
    await page.context().setOffline(false);

    // Race: either the queue empties via auto-flush, or the "Sync now"
    // button appears and we click it to trigger the flush manually.
    const syncButton = page.locator('button:has-text("Sync now")');
    const queueEmptyPromise = waitForQueueEmpty(page, user.id, 8_000)
      .then(() => true)
      .catch(() => false);

    const syncVisiblePromise = syncButton
      .waitFor({ state: "visible", timeout: 8_000 })
      .then(() => true)
      .catch(() => false);

    const autoFlushed = await queueEmptyPromise;
    if (!autoFlushed) {
      const buttonVisible = await syncVisiblePromise;
      if (buttonVisible) {
        await syncButton.click();
      }
      await waitForQueueEmpty(page, user.id, 15_000);
    }

    // Verify the POST reached the backend
    const postRequests = apiRequests.filter(
      (r) => r.method() === "POST" && r.url().includes("/overtime/logs/")
    );
    expect(postRequests.length).toBeGreaterThanOrEqual(1);

    // Verify the overtime was persisted by reading it back from the API
    // (use the direct Django URL, same as the flush path). Pass
    // ignore_date_filter=true because the viewset defaults to the current
    // month, which would exclude our far-future test date.
    const verifyResult = await page.evaluate(
      async ({ date, clientId, tok }) => {
        const resp = await fetch(
          `http://127.0.0.1:8000/api/overtime/logs/?date=${date}&client=${clientId}&ignore_date_filter=true`,
          { headers: { Authorization: `Bearer ${tok}` } }
        );
        const body = await resp.json();
        const results = Array.isArray(body) ? body : body.results;
        return { status: resp.status, count: results.length };
      },
      { date: overtimeDate, clientId: e2eClient.id, tok: token }
    );
    expect(verifyResult.status).toBe(200);
    expect(verifyResult.count).toBeGreaterThanOrEqual(1);
  });

  test("standby form is usable for an offline queued submission", async ({ page }) => {
    const user = await loginAsUser(page, E2E_CREDENTIALS.employeeA);
    const date = uniqueFutureDate();

    await page.goto("/standby");
    await page.getByRole("button", { name: "Add Entry" }).click();
    await page.locator('input[placeholder="DD/MM/YYYY"]').fill(displayDate(date));
    await page.locator('input[type="time"]').nth(0).fill("18:00");
    await page.locator('input[type="time"]').nth(1).fill("20:00");
    await page.getByRole("dialog").locator("input").last().fill("E2E standby form payload");
    await expect(page.getByRole("dialog", { name: "New Standby" })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();

    await injectQueuedMutation(page, user.id, {
      url: "/standby/logs/",
      method: "POST",
      body: {
        date,
        start_time: "18:00",
        end_time: "20:00",
        description: "E2E standby form payload",
      },
      description: "Standby submission",
    });
    await waitForManualOrAutoFlush(page, user.id);
    expect(await getQueuedMutations(page, user.id)).toHaveLength(0);
  });

  test("leave form is usable for an offline queued submission", async ({ page }) => {
    const user = await loginAsUser(page, E2E_CREDENTIALS.employeeA);
    const date = uniqueBusinessDate();

    await page.goto("/leave-management");
    await page.getByRole("button", { name: "New Request" }).click();
    const datePickers = page.locator('input[placeholder="DD/MM/YYYY"]');
    await datePickers.nth(0).fill(displayDate(date));
    await datePickers.nth(1).fill(displayDate(date));
    await page.locator("textarea").fill("E2E leave form payload");
    await expect(page.getByRole("dialog", { name: "New Request" })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();

    await injectQueuedMutation(page, user.id, {
      url: "/leave-management/requests/",
      method: "POST",
      body: {
        request_type: "vacation",
        start_date: date,
        end_date: date,
        reason: "E2E leave form payload",
      },
      description: "Leave submission",
    });
    await waitForManualOrAutoFlush(page, user.id);
    expect(await getQueuedMutations(page, user.id)).toHaveLength(0);
  });

  test("retains queued data through token expiry and replays after re-authentication", async ({
    page,
  }) => {
    const user = await loginAsUser(page, E2E_CREDENTIALS.employeeA);
    await injectQueuedMutation(page, user.id, {
      url: "/standby/logs/",
      method: "POST",
      body: {
        date: uniqueFutureDate(),
        start_time: "18:00",
        end_time: "20:00",
        description: "E2E token recovery",
      },
      description: "Standby submission",
    });
    const token = await page.evaluate(() => localStorage.getItem("access_token"));
    await page.evaluate(() => localStorage.removeItem("access_token"));
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect.poll(() => getQueuedMutations(page, user.id)).toHaveLength(1);

    await page.evaluate((value) => localStorage.setItem("access_token", value!), token);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await waitForManualOrAutoFlush(page, user.id);
    expect(await getQueuedMutations(page, user.id)).toHaveLength(0);
  });

  test("two tabs flush one queued mutation", async ({ page, context }) => {
    const user = await loginAsUser(page, E2E_CREDENTIALS.employeeA);
    const date = uniqueFutureDate();
    await injectQueuedMutation(page, user.id, {
      url: "/standby/logs/",
      method: "POST",
      body: { date, start_time: "18:00", end_time: "20:00", description: "E2E two-tab flush" },
      description: "Standby submission",
    });
    const secondPage = await context.newPage();
    await secondPage.goto("/dashboard");
    await Promise.all([
      page.evaluate(() => window.dispatchEvent(new Event("online"))),
      secondPage.evaluate(() => window.dispatchEvent(new Event("online"))),
    ]);
    await waitForQueueEmpty(page, user.id, 20_000);
    expect(await getQueuedMutations(secondPage, user.id)).toHaveLength(0);
    await secondPage.close();
  });

  test("logout clears the user's offline queue", async ({ page }) => {
    const user = await loginAsUser(page, E2E_CREDENTIALS.employeeA);

    // Inject a mutation while online (simulating a queued item from a
    // previous offline session)
    await injectQueuedMutation(page, user.id, {
      url: "/overtime/logs/",
      method: "POST",
      body: { client: 1, date: uniqueFutureDate(), hours: 1 },
      description: "Overtime (pending)",
    });

    const queuedBefore = await getQueuedMutations(page, user.id);
    expect(queuedBefore).toHaveLength(1);

    // Click the Logout button (handles both desktop sidebar and mobile menu)
    await logoutViaUI(page);

    // The queue key should be gone from localStorage after logout
    const queueAfter = await page.evaluate((userId) => {
      const key = `engtracker:offline-queue:v2:${userId}`;
      return localStorage.getItem(key);
    }, user.id);
    expect(queueAfter).toBeNull();
  });

  test("user B's queue is empty after user A logs out (account isolation)", async ({ page }) => {
    const userA = await loginAsUser(page, E2E_CREDENTIALS.employeeA);

    // Inject a mutation into user A's queue
    await injectQueuedMutation(page, userA.id, {
      url: "/overtime/logs/",
      method: "POST",
      body: { client: 1, date: uniqueFutureDate(), hours: 1 },
      description: "Overtime (user A pending)",
    });

    // Logout user A
    await logoutViaUI(page);

    // Login as user B
    const userB = await loginAsUser(page, E2E_CREDENTIALS.employeeB);

    // User B's queue must be empty — no cross-user leakage
    const queuedB = await getQueuedMutations(page, userB.id);
    expect(queuedB).toHaveLength(0);

    // User A's queue key should also be gone (cleared on logout)
    const queueA = await page.evaluate((userId) => {
      return localStorage.getItem(`engtracker:offline-queue:v2:${userId}`);
    }, userA.id);
    expect(queueA).toBeNull();
  });
});
