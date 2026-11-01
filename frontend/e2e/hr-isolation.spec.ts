// Pure-HR isolation (2026-10-29): HR has no personal hours, team calendar or
// Ticket KPI, and /hr/team-leaders lists plain employees only. HR who is also
// a TL or admin keeps every surface.
import { expect, test } from "@playwright/test";
import { E2E_CREDENTIALS, fetchApiToken, loginAsRole } from "./helpers";

async function expectRedirect(
  page: import("@playwright/test").Page,
  path: string,
  expected: string
) {
  await page.goto(path);
  await page.waitForURL((url) => url.pathname === expected, { timeout: 15_000 });
  expect(new URL(page.url()).pathname).toBe(expected);
}

const nav = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "Main navigation" });

test("pure HR: no personal/team surfaces in the sidebar, no personal dashboard", async ({
  page,
}) => {
  await loginAsRole(page, "hr");
  await expect(nav(page).getByRole("menuitem", { name: "HR Reports" })).toBeVisible();
  for (const name of ["Overtime", "Standby", "Calendar", "Ticket KPI"]) {
    await expect(nav(page).getByRole("menuitem", { name })).toHaveCount(0);
  }
  await expect(page.getByLabel("Switch dashboard")).toHaveCount(0);
  // The Leadership heading must not sit above an empty group.
  await expect(nav(page).getByText("Leadership", { exact: true })).toBeHidden();
});

test("pure HR: overtime, standby, calendar and ticket-kpi routes bounce home", async ({ page }) => {
  await loginAsRole(page, "hr");
  await expectRedirect(page, "/overtime", "/dashboard");
  await expectRedirect(page, "/standby", "/dashboard");
  await expectRedirect(page, "/calendar", "/dashboard");
  await expectRedirect(page, "/ticket-kpi/dashboard", "/dashboard");
});

test("the overtime and standby APIs refuse pure HR and still serve HR+TL", async ({ request }) => {
  const api = "http://127.0.0.1:8000/api";
  const get = async (creds: { username: string; password: string }, path: string) => {
    const token = await fetchApiToken(creds);
    return (
      await request.get(`${api}${path}`, { headers: { Authorization: `Bearer ${token}` } })
    ).status();
  };
  for (const path of ["/overtime/logs/", "/standby/logs/"]) {
    expect(await get(E2E_CREDENTIALS.hr, path)).toBe(403);
    expect(await get(E2E_CREDENTIALS.teamLeaderHr, path)).toBe(200);
  }
});

test("HR who is also a TL keeps overtime, standby, calendar", async ({ page }) => {
  await loginAsRole(page, "teamLeaderHr");
  for (const name of ["Overtime", "Standby", "Calendar"]) {
    await expect(nav(page).getByRole("menuitem", { name })).toBeVisible();
  }
  await page.goto("/overtime");
  await page.waitForURL((url) => url.pathname === "/overtime", { timeout: 15_000 });
  expect(new URL(page.url()).pathname).toBe("/overtime");
});

test("/hr/team-leaders lists plain employees only, with summary cards", async ({ page }) => {
  await loginAsRole(page, "hr");
  await page.goto("/hr/team-leaders");
  await expect(page.getByText("Without any TL")).toBeVisible();
  await expect(page.getByText("Assignable Employees", { exact: true })).toBeVisible();
  const body = page.locator("table");
  await expect(body).toContainText("e2e_employee_a");
  for (const hidden of ["e2e_super", "e2e_admin", "e2e_hr", "e2e_tl", "e2e_hbpr"]) {
    await expect(body.getByText(hidden, { exact: true })).toHaveCount(0);
  }
});
