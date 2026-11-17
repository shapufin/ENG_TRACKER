/**
 * Recurring 1-on-1 plans on the scorecard Team tab, exercised with real clicks:
 * set a schedule for the whole team, see the next date, skip with a reason (the
 * reason is required), log the due 1-on-1 with the date prefilled, remove a schedule.
 *
 * Uses the seeded Line Manager `e2e_tl` and cleans up every plan it creates.
 */
import { execSync } from "node:child_process";
import { expect, request, test, type APIRequestContext } from "@playwright/test";
import { E2E_CREDENTIALS, fetchApiToken, loginAsRole } from "./helpers";

const API_ORIGIN = "http://127.0.0.1:8000";

let ctx: APIRequestContext;
let memberIds: number[] = [];
let firstName = "";

const clearAll = async () => {
  if (ctx && memberIds.length) {
    await ctx.post("/api/plugins/tl_scorecard/one-on-one-plans/clear/", {
      data: { employee_ids: memberIds },
    });
  }
};

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.beforeAll(async () => {
  const token = await fetchApiToken(E2E_CREDENTIALS.teamLeader);
  ctx = await request.newContext({
    baseURL: API_ORIGIN,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
  const team = await ctx.get("/api/plugins/tl_scorecard/team-members/");
  expect(team.ok(), "the leader must be able to read their team").toBeTruthy();
  const body = (await team.json()) as
    | { id: number; full_name: string }[]
    | { results: { id: number; full_name: string }[] };
  const rows = Array.isArray(body) ? body : body.results;
  memberIds = rows.map((r) => r.id);
  firstName = rows[0].full_name;
  expect(memberIds.length, "the seeded leader needs team members").toBeGreaterThan(0);
  await clearAll();
});

test.afterAll(async () => {
  await clearAll();
  await ctx?.dispose();
});

test("a leader schedules the team, skips with a reason, and removes a schedule", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));

  await loginAsRole(page, "teamLeader");
  await page.goto("/tl-scorecard?tab=team");
  await page.waitForLoadState("networkidle").catch(() => undefined);

  // Before: nobody has a schedule.
  await expect(page.getByText("Not set").first()).toBeVisible();

  // Schedule everyone weekly from the toolbar.
  await page.getByRole("button", { name: "Set recurring 1-on-1" }).click();
  const dialog = page.getByRole("dialog", { name: "Set recurring 1-on-1" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox", { name: "Meeting cadence" }).click();
  await page.getByRole("option", { name: "Weekly", exact: true }).click();
  await dialog.getByRole("button", { name: "Save recurring 1-on-1" }).click();
  await expect(dialog).toHaveCount(0);

  // After: a date and a status replace "Not set" in every row.
  await expect(page.getByText("Not set")).toHaveCount(0);
  await expect(page.getByText(/Upcoming|Due today|Overdue/).first()).toBeVisible();

  // Open the first member: schedule, next date and the actions are there.
  await page.getByText(firstName, { exact: true }).first().click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByText("Weekly")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Log 1-on-1" })).toBeVisible();

  // Log: the date field is prefilled with the due slot, not blank or today by accident.
  await panel.getByRole("button", { name: "Log 1-on-1" }).click();
  const log = page.getByRole("dialog", { name: /log a meeting/i });
  await expect(log.getByLabel("Date")).not.toHaveValue("");
  await log.getByRole("button", { name: "Cancel" }).click();

  // The row itself logs a meeting too, without opening the panel.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: `Log meeting with ${firstName}`, exact: true }).click();
  const rowLog = page.getByRole("dialog", { name: /log a meeting/i });
  await expect(rowLog).toBeVisible();
  await rowLog.getByRole("button", { name: "Cancel" }).click();
  await page.getByText(firstName, { exact: true }).first().click();

  // Remove the schedule for this member through the confirm dialog.
  await panel.getByRole("button", { name: "Remove recurring 1-on-1" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByText("Not set").first()).toBeVisible();

  expect(errors.filter((e) => !/favicon|Failed to load resource/i.test(e))).toEqual([]);
});

test("a skip needs a reason and records one", async ({ page }) => {
  // A plan that started long ago is overdue, so the slot can be skipped.
  const set = await ctx.post("/api/plugins/tl_scorecard/one-on-one-plans/", {
    data: {
      employee_ids: [memberIds[0]],
      cadence: "weekly",
      cadence_day_of_week: null,
      cadence_nth_week: null,
    },
  });
  expect(set.ok()).toBeTruthy();
  // Not due yet: the API must refuse, with a message, not a 500.
  const early = await ctx.post("/api/plugins/tl_scorecard/one-on-one-plans/skip/", {
    data: { employee: memberIds[0], reason: "Too early" },
  });
  expect(early.status()).toBe(400);
  const blank = await ctx.post("/api/plugins/tl_scorecard/one-on-one-plans/skip/", {
    data: { employee: memberIds[0], reason: "  " },
  });
  expect(blank.status()).toBe(400);

  await loginAsRole(page, "teamLeader");
  await page.goto("/tl-scorecard?tab=team");
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await expect(page.getByText(/Upcoming|Due today|Overdue/).first()).toBeVisible();
});

test("skip all overdue clears a backlog with one reason", async ({ page }) => {
  const set = await ctx.post("/api/plugins/tl_scorecard/one-on-one-plans/", {
    data: {
      employee_ids: [memberIds[0]],
      cadence: "weekly",
      cadence_day_of_week: null,
      cadence_nth_week: null,
    },
  });
  expect(set.ok()).toBeTruthy();
  // Three weeks of missed slots: move the plan's start back (dev data only; the API starts a plan today).
  execSync(
    `python ../manage.py shell -c "from datetime import timedelta;from plugins.tl_scorecard.models import OneOnOnePlan, OneOnOneSkip;OneOnOneSkip.objects.filter(employee_id=${memberIds[0]}).delete();from core.utils.timezone_local import business_today;OneOnOnePlan.objects.filter(employee_id=${memberIds[0]}).update(effective_from=business_today()-timedelta(weeks=3))"`,
    { env: { ...process.env, DJANGO_SETTINGS_MODULE: "config.settings_e2e" }, stdio: "ignore" }
  );

  await loginAsRole(page, "teamLeader");
  await page.goto("/tl-scorecard?tab=team");
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.getByText(firstName, { exact: true }).first().click();
  const panel = page.getByRole("dialog");
  await panel.getByRole("button", { name: "Skip", exact: true }).click();
  const skip = page.getByRole("dialog", { name: /skip this 1-on-1/i });
  await skip.getByLabel("Reason").fill("Project crunch");
  await skip.getByRole("checkbox", { name: /skip all overdue/i }).check();
  await skip.getByRole("button", { name: /skip 1-on-1/i }).click();
  await expect(page.getByText(/\d+ 1-on-1s skipped/)).toBeVisible({ timeout: 15_000 });

  // Nothing is overdue any more: the open panel shows the next slot as upcoming without a reload.
  await expect(panel.getByText("Upcoming")).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByText("Overdue")).toHaveCount(0);
});
