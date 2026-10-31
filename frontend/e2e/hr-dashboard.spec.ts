/**
 * HR dashboard data wiring — the regression this file exists for (2026-10-31).
 *
 * The HR dashboard used to read the PERSONAL overtime/standby list endpoints:
 * pure HR got 403s (empty chart, empty recent tables, Approved=0) and
 * multi-role HR saw only their own rows. Every unit test mocks the service
 * layer, so the suite was green before AND after that bug — only a browser run
 * can prove which endpoint the app actually calls and that the rendered values
 * are the org ones.
 *
 * Assertions compare the UI against `GET /api/dashboard/widgets/hr_overview/`
 * fetched with the same viewer's token (the repo's UI-vs-API convention).
 */
import { expect, test } from "@playwright/test";
import { E2E_CREDENTIALS, fetchApiToken, loginAsRole } from "./helpers";

const API = "http://127.0.0.1:8000";

/** Only the personal list action has `/logs/?` — summary/admin_logs/team_* do not. */
const isPersonalListCall = (url: string) => /\/api\/(overtime|standby)\/logs\/\?/.test(url);

test.describe("HR dashboard org data", () => {
  test("renders the hr_overview aggregate and never calls the personal lists", async ({
    page,
  }) => {
    const personalCalls: string[] = [];
    const overviewCalls: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("/dashboard/widgets/hr_overview/")) overviewCalls.push(url);
      if (isPersonalListCall(url)) personalCalls.push(url);
    });

    await loginAsRole(page, "hr");

    // The API answer for this viewer; every UI assertion below is measured against it.
    const token = await fetchApiToken(E2E_CREDENTIALS.hr);
    const res = await page.request.get(`${API}/api/dashboard/widgets/hr_overview/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();

    await expect(page.getByRole("heading", { name: "Approved Hours" })).toBeVisible();
    expect(overviewCalls.length).toBeGreaterThan(0);

    // Request Pipeline bars come from the org status counts — all three.
    const pipeline = page.getByTestId("hr-pipeline");
    await expect(pipeline.getByText("Pending")).toBeVisible();
    for (const value of [
      data.status_counts.pending,
      data.status_counts.approved,
      data.status_counts.rejected,
    ]) {
      await expect(pipeline.getByText(String(value), { exact: true }).first()).toBeVisible();
    }

    // Chart: a real series when approved hours exist, an honest empty state otherwise.
    const approvedTotal = data.monthly_hours.reduce(
      (sum: number, m: { overtime: number; standby: number }) => sum + m.overtime + m.standby,
      0
    );
    if (approvedTotal > 0) {
      await expect(page.getByText("No approved hours for this period.")).toHaveCount(0);
      await expect(page.getByTestId("hr-hours-chart").locator(".recharts-wrapper")).toBeVisible();
    } else {
      await expect(page.getByText("No approved hours for this period.")).toBeVisible();
    }

    // Recent rows name the record owner (the org's newest row, not the viewer's).
    if (data.recent_overtime.length > 0) {
      await expect(page.getByText(data.recent_overtime[0].user_name).first()).toBeVisible();
    }
    if (data.recent_standby.length > 0) {
      await expect(page.getByText(data.recent_standby[0].user_name).first()).toBeVisible();
    }

    // The pending-leave badge carries the org total, not the fetched page size.
    await expect(page.getByText(`${data.pending_leave_total} Awaiting Decision`)).toBeVisible();

    // The regression itself: the personal list endpoints must never fire.
    expect(personalCalls).toEqual([]);
  });
});
