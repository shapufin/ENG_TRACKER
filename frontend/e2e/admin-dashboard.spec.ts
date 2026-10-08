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
    const title = (await strip.locator("p.text-sm").first().innerText()).replace(/^.*·\s*/s, "").trim();
    await strip.getByRole("button", { name: "Dismiss insight" }).click();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Admin Dashboard" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Automated insights" }).getByText(title)).toHaveCount(0);
  });

  test("?section= filters the widgets and marks the tab", async ({ page }) => {
    await loginAsUser(page, E2E_CREDENTIALS.admin);
    await page.goto("/admin?section=approvals");
    await expect(page.getByRole("tab", { name: "Approvals" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Pending Approvals").first()).toBeVisible();
    await expect(page.getByText("Total Users")).toHaveCount(0);
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
