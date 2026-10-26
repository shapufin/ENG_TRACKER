/**
 * Previous Years page, end to end (plan `2026-10-26-year-close-snapshot.md`, Y4).
 *
 * A closed year is superuser-only evidence: the page gates itself (the route
 * admits staff), lists the set, and downloads a file through a signed link.
 * Chromium only — closing a year is global state, so two projects would fight.
 */
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";
import { E2E_CREDENTIALS, loginAsUser } from "./helpers";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const YEAR = new Date().getFullYear() - 1;

const runsHere = () => test.info().project.name === "chromium";

function django(code: string) {
  execSync(`python "${resolve(PROJECT_ROOT, "manage.py")}" shell -c "${code}"`, {
    cwd: PROJECT_ROOT,
    stdio: "pipe",
    env: { ...process.env, DJANGO_SETTINGS_MODULE: "config.settings_e2e" },
  });
}

/** A finished year with one rejected row, so the set has a real bundle. */
const seedYear = () =>
  django(
    `from datetime import date; ` +
      `from django.contrib.auth import get_user_model; ` +
      `from apps.overtime.models import Client, OvertimeLog; ` +
      `U = get_user_model(); ` +
      `u = U.objects.get(username='e2e_employee_a'); ` +
      `c = Client.objects.get(code='E2E'); ` +
      `OvertimeLog.objects.get_or_create(user=u, client=c, date=date(${YEAR}, 6, 10), ` +
      `description='previous-years probe', defaults={'hours': 2, 'status': 'rejected'})`
  );

const resetFixture = () =>
  django(
    `import shutil; ` +
      `from pathlib import Path; ` +
      `from django.conf import settings; ` +
      `from apps.overtime.models import OvertimeLog; ` +
      `from apps.users.services.approval_periods import reopen_year; ` +
      `from plugins.year_close.models import YearSnapshot; ` +
      `reopen_year(${YEAR}, reason='e2e_cleanup'); ` +
      `OvertimeLog.objects.filter(description='previous-years probe').delete(); ` +
      `YearSnapshot.objects.filter(year=${YEAR}).delete(); ` +
      `shutil.rmtree(Path(settings.SNAPSHOT_ROOT) / '${YEAR}', ignore_errors=True)`
  );

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  if (!runsHere()) return;
  resetFixture();
  seedYear();
  django(`from plugins.year_close.services.closer import close_year; close_year(${YEAR})`);
});

test.afterAll(() => {
  if (!runsHere()) return;
  resetFixture();
});

test("a superuser lists the closed year and downloads a file", async ({ page }) => {
  test.skip(!runsHere(), "closing a year is global state: one project only");

  await loginAsUser(page, E2E_CREDENTIALS.superuser);
  await page.goto("/admin/previous-years");

  await expect(page.getByRole("heading", { name: "Previous Years" })).toBeVisible();
  const yearRow = page.getByRole("row", { name: new RegExp(String(YEAR)) });
  await expect(yearRow.getByText("ready")).toBeVisible();

  // Row actions live in a pill revealed on hover; hover the row, then click.
  await yearRow.hover();
  await page.getByRole("button", { name: `Files for ${YEAR}` }).click({ force: true });
  await expect(page.getByText("company", { exact: true })).toBeVisible();

  // Same hover-gated pill as the years table.
  const companyRow = page.getByRole("row", { name: /company/ });
  await companyRow.hover();
  const download = page.waitForEvent("download", { timeout: 45_000 });
  await page.getByRole("button", { name: "Download company file" }).click({ force: true });
  await download;
});

test("staff is refused, because the route alone is not the gate", async ({ page }) => {
  test.skip(!runsHere(), "closing a year is global state: one project only");

  await loginAsUser(page, E2E_CREDENTIALS.admin);
  await page.goto("/admin/previous-years");
  await expect(page.getByText("Access Denied")).toBeVisible();
});
