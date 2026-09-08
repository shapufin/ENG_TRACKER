/**
 * Shared E2E helpers — login via the UI, inject queued offline mutations
 * directly into localStorage, and query the offline queue state.
 *
 * These helpers keep the authenticated E2E tests robust by avoiding
 * brittle interactions with complex React form components (Select,
 * DatePicker, TimeHoursGrid). The offline queue's enqueue/flush logic is
 * already unit-tested in Vitest; the E2E suite validates the integration
 * (login → queue → flush → backend persistence).
 */
import { type Page, type Request } from "@playwright/test";

export const E2E_CREDENTIALS = {
  employeeA: { username: "e2e_employee_a", password: "e2e_pass_2026" },
  employeeB: { username: "e2e_employee_b", password: "e2e_pass_2026" },
  teamLeader: { username: "e2e_tl", password: "e2e_pass_2026" },
  hr: { username: "e2e_hr", password: "e2e_pass_2026" },
  admin: { username: "e2e_admin", password: "e2e_pass_2026" },
  teamLeaderHr: { username: "e2e_tl_hr", password: "e2e_pass_2026" },
};

export const E2E_CLIENT_CODE = "E2E";
export type E2ERole = keyof typeof E2E_CREDENTIALS;

/**
 * Log in via the UI login page and wait for redirect away from /login.
 * Returns the user object stored in localStorage.
 */
export async function loginAsUser(
  page: Page,
  creds: { username: string; password: string }
): Promise<{ id: number; username: string }> {
  await page.goto("/login");
  await page.fill("#username", creds.username);
  await page.fill("#password", creds.password);
  await page.click('button[type="submit"]');
  // Wait for the app to redirect away from the login page
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15_000,
  });
  // Wait for the user object to be persisted in localStorage
  await page.waitForFunction(() => {
    const raw = localStorage.getItem("user");
    return raw !== null && JSON.parse(raw).id != null;
  });
  return page.evaluate(() => JSON.parse(localStorage.getItem("user")!));
}

export function loginAsRole(page: Page, role: E2ERole) {
  return loginAsUser(page, E2E_CREDENTIALS[role]);
}

/**
 * Inject a queued offline mutation directly into localStorage, matching
 * the exact format the offlineQueue module uses. This simulates what
 * happens when requestWithOfflineQueue catches a network failure.
 *
 * The queue key is `engtracker:offline-queue:v2:<userId>`.
 */
export async function injectQueuedMutation(
  page: Page,
  userId: number,
  mutation: {
    url: string;
    method: "POST" | "PUT" | "PATCH" | "DELETE";
    body: unknown;
    description: string;
  }
): Promise<void> {
  await page.evaluate(
    ({ userId, mutation }) => {
      const key = `engtracker:offline-queue:v2:${userId}`;
      const existing = JSON.parse(localStorage.getItem(key) || "[]");
      existing.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        timestamp: Date.now(),
        userId: String(userId),
        idempotencyKey:
          typeof crypto?.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`,
        ...mutation,
        headers: {},
      });
      localStorage.setItem(key, JSON.stringify(existing));
    },
    { userId, mutation }
  );
}

/**
 * Read the queued mutations for a user from localStorage.
 */
export async function getQueuedMutations(page: Page, userId: number): Promise<unknown[]> {
  return page.evaluate((userId) => {
    const key = `engtracker:offline-queue:v2:${userId}`;
    return JSON.parse(localStorage.getItem(key) || "[]");
  }, userId);
}

/**
 * Wait for the offline queue for a user to become empty.
 */
export async function waitForQueueEmpty(
  page: Page,
  userId: number,
  timeoutMs = 15_000
): Promise<void> {
  await page.waitForFunction(
    (userId) => {
      const key = `engtracker:offline-queue:v2:${userId}`;
      const queue = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(queue) && queue.length === 0;
    },
    userId,
    { timeout: timeoutMs }
  );
}

/**
 * Collect the most recent API request to a given URL pattern, useful for
 * verifying that a queued mutation was actually sent to the backend.
 */
export function captureApiRequests(page: Page, urlPattern: string): Request[] {
  const captured: Request[] = [];
  page.on("request", (req) => {
    if (req.url().includes(urlPattern)) captured.push(req);
  });
  return captured;
}

/**
 * Log out via the UI. The Logout button lives in the sidebar, which on
 * mobile is off-screen (translated) and on desktop may be below the fold
 * or covered by the OfflineIndicator banner. To handle all cases
 * robustly, we click the button via JavaScript (dispatching a real click
 * event that triggers the React onClick handler) rather than relying on
 * Playwright's viewport-based visibility checks. Waits for redirect to
 * /login.
 */
export async function logoutViaUI(page: Page): Promise<void> {
  // Wait for the Logout button to be attached to the DOM
  await page.locator('button:has-text("Logout")').waitFor({ state: "attached", timeout: 10_000 });

  // Click via JavaScript to bypass viewport/overlay interception issues.
  // This dispatches a real click event that React's onClick handler receives.
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const logoutBtn = buttons.find((b) => b.textContent?.includes("Logout"));
    if (!logoutBtn) throw new Error("Logout button not found in DOM");
    logoutBtn.click();
  });

  await page.waitForURL(/\/login/, { timeout: 10_000 });
}
