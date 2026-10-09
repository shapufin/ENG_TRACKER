// Visual-plan guard contract (Phase 7 batch 12): unauthorized route/role
// combinations must land on the specified redirect — never render content
// and never count as visual captures. Mirrors GUARD_ONLY in
// frontend/scripts/visual-route-manifest.mjs (keep both in sync).
import { expect, test } from "@playwright/test";
import { loginAsRole } from "./helpers";

async function expectRedirect(
  page: import("@playwright/test").Page,
  path: string,
  expected: string
) {
  await page.goto(path);
  await page.waitForURL((url) => url.pathname === expected, { timeout: 15_000 });
  expect(new URL(page.url()).pathname).toBe(expected);
}

test("employee guard redirects (TL/HR/admin/plugin routes); team shows denial", async ({
  page,
}) => {
  await loginAsRole(page, "employeeA");
  // /team is NOT redirect-guarded (AppRoutes): denial renders in place.
  await page.goto("/team");
  await page.waitForURL((url) => url.pathname === "/team", { timeout: 15_000 });
  expect(new URL(page.url()).pathname).toBe("/team");
  await expect(page.getByText("Access Denied")).toBeVisible();
  await expectRedirect(page, "/team/approvals", "/dashboard");
  await expectRedirect(page, "/hr/reports", "/dashboard");
  await expectRedirect(page, "/analytics", "/dashboard");
  await expectRedirect(page, "/admin/users", "/dashboard");
});

test("pure-TL guard redirects (HR/analytics/admin routes); team routes stay", async ({ page }) => {
  await loginAsRole(page, "teamLeader");
  await expectRedirect(page, "/hr/reports", "/dashboard");
  await expectRedirect(page, "/analytics", "/dashboard");
  await expectRedirect(page, "/admin/users", "/dashboard");
  // Authorized: TLRoute passes — must NOT redirect.
  await page.goto("/team");
  await page.waitForURL((url) => url.pathname === "/team", { timeout: 15_000 });
  expect(new URL(page.url()).pathname).toBe("/team");
});

test("pure-HR guard redirects (approvals, admin shell); team denial stays", async ({ page }) => {
  await loginAsRole(page, "hr");
  await page.goto("/team");
  await page.waitForURL((url) => url.pathname === "/team", { timeout: 15_000 });
  expect(new URL(page.url()).pathname).toBe("/team");
  await expect(page.getByText("Access Denied")).toBeVisible();
  await expectRedirect(page, "/team/approvals", "/dashboard");
  // HR admin-panel isolation (2026-09-26): SuperuserRoute admits admin/superuser only, so the
  // whole /admin shell redirects HR. HR reaches holidays and payroll via /hr/* pages instead.
  await expectRedirect(page, "/admin/users", "/dashboard");
});

test("hr admin-shell surfaces redirect to the dashboard (admin gate)", async ({ page }) => {
  await loginAsRole(page, "hr");
  await expectRedirect(page, "/admin/analytics", "/dashboard");
  await expectRedirect(page, "/analytics", "/dashboard");
  await expectRedirect(page, "/admin/payroll/runs", "/dashboard");
  await expectRedirect(page, "/admin/leave-requests", "/dashboard");
  await expectRedirect(page, "/admin/leave-balances", "/dashboard");
});

test("HBPR-only guard redirects (scorecard authoring, calendar, leave)", async ({ page }) => {
  await loginAsRole(page, "hbpr");
  // The AL-TL authoring page bounces to the HBPR's own workspace, before any of
  // its queries fire; Calendar and Leave are HbprRestrictedRoute-wrapped and go
  // straight to /hbpr too (that IS their home — no /dashboard for an HBPR).
  await expectRedirect(page, "/tl-scorecard", "/hbpr");
  await expectRedirect(page, "/calendar", "/hbpr");
  await expectRedirect(page, "/leave-management", "/hbpr");
  // Authorized: the workspace itself must NOT redirect.
  await page.goto("/hbpr");
  await page.waitForURL((url) => url.pathname === "/hbpr", { timeout: 15_000 });
  expect(new URL(page.url()).pathname).toBe("/hbpr");
});

// Runtime guard for the control-kit contract (docs/ui-control-kit.md): in every FilterToolbar the search
// field, selects, date pickers and buttons share ONE height. Static audits cannot see a class that
// resolves differently at runtime (a token override, a `size` prop that does not reach the DOM).
// Toggle chips (aria-pressed), icon-only squares and the in-field Clear button are intentionally excluded.
const TOOLBAR_PAGES = [
  "/admin/users",
  "/admin/leave-requests",
  "/admin/leave-balances",
  "/admin/overtime-logs",
  "/admin/audit-logs",
  "/admin/resource-access",
];

for (const path of TOOLBAR_PAGES) {
  test(`filter toolbar controls share one height on ${path}`, async ({ page }) => {
    await loginAsRole(page, "admin");
    await page.goto(path);
    await page.waitForURL((url) => url.pathname === path, { timeout: 15_000 });
    await page.locator("[data-filter-toolbar]").first().waitFor({ state: "visible" });

    const toolbars = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-filter-toolbar]")).map((toolbar) => {
        const controls = Array.from(
          toolbar.querySelectorAll<HTMLElement>(
            'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), button, [role="combobox"]'
          )
        ).filter((el) => {
          if (el.matches('[aria-pressed], [aria-label="Clear search"]')) return false;
          const box = el.getBoundingClientRect();
          // Skip hidden controls and icon-only squares (width === height).
          return box.width > 0 && box.height > 0 && Math.abs(box.width - box.height) > 1;
        });
        return controls.map((el) => ({
          name: el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 24) || el.tagName,
          height: el.getBoundingClientRect().height,
        }));
      })
    );

    expect(toolbars.length).toBeGreaterThan(0);
    for (const controls of toolbars) {
      if (controls.length < 2) continue;
      const heights = controls.map((c) => c.height);
      const spread = Math.max(...heights) - Math.min(...heights);
      expect(spread, JSON.stringify(controls)).toBeLessThanOrEqual(1);
    }
  });
}
