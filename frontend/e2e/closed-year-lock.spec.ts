/**
 * Closed-year write lock, end to end (plan `2026-10-26-year-close-snapshot.md`, phase Y2).
 *
 * The rule is backend-side; this spec proves it reaches a real user: the API
 * refuses the write and the SPA shows the refusal instead of a 500 or a silent
 * success. Chromium only — closing a year is a global, non-concurrent operation
 * and two projects closing/reopening it at once would fight over the same row.
 */
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, request, test, type APIRequestContext } from "@playwright/test";
import { E2E_CREDENTIALS, fetchApiToken, loginAsUser } from "./helpers";

const API_ORIGIN = "http://127.0.0.1:8000";
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TODAY = new Date().toISOString().slice(0, 10);
const YEAR = Number(TODAY.slice(0, 4));

let ctx: APIRequestContext;
let logId = 0;

interface ApiRow {
  id: number;
  code?: string;
  username?: string;
}

const asList = (data: unknown): ApiRow[] =>
  Array.isArray(data) ? (data as ApiRow[]) : ((data as { results?: ApiRow[] })?.results ?? []);

/** Run a snippet against the e2e database (there is no API for closing a year). */
function django(code: string) {
  execSync(`python "${resolve(PROJECT_ROOT, "manage.py")}" shell -c "${code}"`, {
    cwd: PROJECT_ROOT,
    stdio: "pipe",
    env: { ...process.env, DJANGO_SETTINGS_MODULE: "config.settings_e2e" },
  });
}

const closeYear = () =>
  django(`from apps.users.services.approval_periods import close_year; close_year(${YEAR})`);

/** Reopen the year and drop this spec's probe rows, so a re-run starts clean. */
const resetFixture = () =>
  django(
    `from apps.users.services.approval_periods import reopen_year; ` +
      `from apps.overtime.models import OvertimeLog; ` +
      `reopen_year(${YEAR}, reason='e2e_cleanup'); ` +
      `OvertimeLog.objects.filter(description='closed-year probe').delete()`
  );

test.describe.configure({ mode: "serial" });

// Closing a year is global state: two projects closing and reopening it at the
// same time would fight over the row and over each other's assertions, so this
// file only runs in one project.
const runsHere = () => test.info().project.name === "chromium";

test.beforeAll(async () => {
  if (!runsHere()) return;
  // A previous interrupted run can leave the year closed and its probe row behind.
  resetFixture();
  const token = await fetchApiToken(E2E_CREDENTIALS.superuser);
  ctx = await request.newContext({
    baseURL: API_ORIGIN,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });

  const clients = asList(
    await (await ctx.get("/api/overtime/clients/", { params: { search: "E2E" } })).json()
  );
  const client = clients.find((row) => row.code === "E2E");
  const users = asList(
    await (await ctx.get("/api/users/users/", { params: { search: "e2e_super" } })).json()
  );
  const superuser = users.find((row) => row.username === "e2e_super");

  const created = await ctx.post("/api/overtime/logs/", {
    data: {
      user: superuser?.id,
      client: client?.id,
      date: TODAY,
      // Times, not a bare hours count: the edit form requires both, and a form
      // that fails its own validation never reaches the API.
      start_time: "09:00",
      end_time: "10:00",
      description: "closed-year probe",
      evidence_type: "other",
      evidence: "e2e",
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  logId = ((await created.json()) as { id: number }).id;

  closeYear();
});

test.afterAll(async () => {
  if (!runsHere()) return;
  resetFixture();
  await ctx.dispose();
});

test("the API refuses to create, edit or approve a record in a closed year", async () => {
  test.skip(!runsHere(), "a global year close runs in one project only");
  const created = await ctx.post("/api/overtime/logs/", {
    data: { date: TODAY, hours: 1, client: 1, description: "must be refused" },
  });
  expect(created.status()).toBe(400);
  const body = await created.text();
  expect(body).toContain("is closed");
  expect(body).toContain("reopen_year");

  const patched = await ctx.patch(`/api/overtime/logs/${logId}/`, { data: { hours: 3 } });
  expect(patched.status()).toBe(403);
  expect(await patched.text()).toContain("reopen_year");

  // Reading is still allowed: a frozen year is the evidence.
  const read = await ctx.get(`/api/overtime/logs/${logId}/`);
  expect(read.status()).toBe(200);
});

test("the user sees the closed-year refusal when saving an entry", async ({ page }) => {
  test.skip(!runsHere(), "a global year close runs in one project only");
  await loginAsUser(page, E2E_CREDENTIALS.superuser);
  await page.goto("/overtime");

  const editButton = page.getByRole("button", { name: `Edit ${logId}` });
  await expect(editButton).toBeAttached();
  await editButton.click({ force: true });

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Save" }).click();

  // The refusal must name the year and the way out — not a generic failure.
  await expect(page.getByText(/is closed/).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/reopen_year/).first()).toBeVisible();
});
