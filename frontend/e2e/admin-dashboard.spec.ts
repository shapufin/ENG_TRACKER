import { expect, test, type Page } from "@playwright/test";
import { E2E_CREDENTIALS, loginAsUser } from "./helpers";

const API = "http://127.0.0.1:8000/api/dashboard/widgets";

async function apiStatus(page: Page, path: string): Promise<number> {
  return page.evaluate(async (url) => {
    const token = localStorage.getItem("access_token");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    return res.status;
  }, `${API}/${path}/`);
}

test.describe("Admin dashboard", () => {
  test.describe.configure({ timeout: 60_000 });

  test("insights strip: a dismissed insight stays dismissed after reload", async ({ page }) => {
    await loginAsUser(page, E2E_CREDENTIALS.admin);
    await page.goto("/admin");
    const strip = page.getByRole("region", { name: "Automated insights" });
    await expect(strip).toBeVisible();
    const title = (await strip.locator("p.text-sm").first().innerText())
      .replace(/^.*·\s*/s, "")
      .trim();
    await strip.getByRole("button", { name: "Dismiss insight" }).click();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Admin Dashboard" })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Automated insights" }).getByText(title)
    ).toHaveCount(0);
  });

  test("?section= filters the widgets and marks the tab", async ({ page }) => {
    await loginAsUser(page, E2E_CREDENTIALS.admin);
    await page.goto("/admin?section=approvals");
    await expect(page.getByRole("tab", { name: "Approvals" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(page.getByText("Approval Queue").first()).toBeVisible();
    await expect(page.getByRole("group", { name: "Key figures" })).toHaveCount(0);
  });

  test("Ctrl+K opens the palette and Enter navigates", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard shortcut is a desktop affordance");
    await loginAsUser(page, E2E_CREDENTIALS.admin);
    await page.goto("/admin");
    // The shell (and its key listener) is mounted once the sidebar trigger is there.
    await expect(page.getByRole("button", { name: "Search pages" })).toBeVisible();
    await page.keyboard.press("Control+k");
    const input = page.getByRole("combobox", { name: "Search admin pages" });
    await expect(input).toBeVisible();
    await input.fill("leave req");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/admin\/leave-requests/);
  });

  test("the aggregate endpoints reject an employee", async ({ page }) => {
    await loginAsUser(page, E2E_CREDENTIALS.employeeA);
    expect(await apiStatus(page, "admin_trends")).toBe(403);
    expect(await apiStatus(page, "admin_people")).toBe(403);
  });

  test("the aggregate endpoints serve an admin", async ({ page }) => {
    await loginAsUser(page, E2E_CREDENTIALS.admin);
    expect(await apiStatus(page, "admin_trends")).toBe(200);
    expect(await apiStatus(page, "admin_people")).toBe(200);
  });
});

test.describe("Admin dashboard follow-ups", () => {
  test.describe.configure({ timeout: 90_000 });

  test("palette finds a user and opens the Users page filtered to them", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "keyboard shortcut is a desktop affordance");
    await loginAsUser(page, E2E_CREDENTIALS.admin);
    await page.goto("/admin");
    await expect(page.getByRole("button", { name: "Search pages" })).toBeVisible();
    await page.keyboard.press("Control+k");
    const input = page.getByRole("combobox", { name: "Search admin pages" });
    await input.fill("e2e_employee_a");
    await expect(page.getByRole("option", { name: /e2e_employee_a/ })).toBeVisible({
      timeout: 10_000,
    });
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/admin\/users\?q=e2e_employee_a/);
    await expect(
      page.getByRole("searchbox").or(page.getByPlaceholder("Search users..."))
    ).toHaveValue("e2e_employee_a");
  });

  test("a preset replaces the layout and survives a reload", async ({ page }) => {
    await loginAsUser(page, E2E_CREDENTIALS.admin);
    await page.goto("/admin");
    await page.getByRole("button", { name: "Dashboard actions" }).click();
    await page.getByRole("menuitem", { name: /Approver view/ }).click();
    await page.getByRole("button", { name: "Apply preset" }).click();
    await expect(page.getByText("Rejection Analysis")).toBeVisible();
    await expect(page.getByRole("group", { name: "Key figures" })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText("Rejection Analysis")).toBeVisible();
    await expect(page.getByRole("group", { name: "Key figures" })).toHaveCount(0);
    // restore the default so later specs see the standard dashboard
    await page.getByRole("button", { name: "Dashboard actions" }).click();
    await page.getByRole("menuitem", { name: /Default layout/ }).click();
    await page.getByRole("button", { name: "Apply preset" }).click();
    await expect(page.getByRole("group", { name: "Key figures" })).toBeVisible();
  });

  test("the trend period is selectable, kept in the URL, and validated by the API", async ({
    page,
  }) => {
    await loginAsUser(page, E2E_CREDENTIALS.admin);
    await page.goto("/admin?months=6");
    // The period selector lives on the Trend tab of the Hours widget.
    await page.getByRole("tab", { name: "Trend" }).click();
    await expect(page.getByRole("button", { name: "6 months" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await page.getByRole("button", { name: "3 months" }).click();
    await expect(page).toHaveURL(/months=3/);
    const bad = await page.evaluate(async (url) => {
      const token = localStorage.getItem("access_token");
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      return res.status;
    }, `${API}/admin_trends/?months=99`);
    expect(bad).toBe(400);
  });

  test("Export PDF downloads a dated pdf", async ({ page }) => {
    await loginAsUser(page, E2E_CREDENTIALS.admin);
    await page.goto("/admin?section=approvals");
    await expect(page.getByText("Approval Queue").first()).toBeVisible();
    const download = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByRole("button", { name: "Dashboard actions" }).click();
    await page.getByRole("menuitem", { name: /export pdf/i }).click();
    expect((await download).suggestedFilename()).toMatch(
      /^admin-dashboard-\d{4}-\d{2}-\d{2}\.pdf$/
    );
  });
});
