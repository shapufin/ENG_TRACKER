/**
 * Calendar responsive E2E — verifies the calendar page works across the
 * viewport sizes required by the mobile/PWA readiness plan:
 *   - 320x568  (smallest phone)
 *   - 393x851  (Pixel 5)
 *   - 412x915  (larger phone)
 *   - 768x1024 (tablet portrait)
 *   - 1024x768 (tablet landscape)
 *   - 1280x720 (desktop)
 *
 * Each viewport block checks:
 *   1. No horizontal overflow (page respects the viewport width).
 *   2. Calendar header controls are reachable and functional.
 *   3. View mode switching (Month/Week/List) works.
 *   4. Prev/Next/Today navigation updates the month title.
 *
 * Mobile-only behavior (filters button, mobile sidebar) is tested in the
 * 320/393/412 blocks.
 *
 * Note: at < 768px the calendar defaults to List view (see
 * useCalendarPageData). Tests that need Month view switch to it explicitly.
 */
import { expect, test, type Page } from "@playwright/test";
import { loginAsRole } from "./helpers";

const VIEWPORTS = [
  { name: "320px phone", width: 320, height: 568, isMobile: true },
  { name: "393px phone", width: 393, height: 851, isMobile: true },
  { name: "412px phone", width: 412, height: 915, isMobile: true },
  { name: "768px tablet portrait", width: 768, height: 1024, isMobile: false },
  { name: "1024px tablet landscape", width: 1024, height: 768, isMobile: false },
  { name: "1280px desktop", width: 1280, height: 720, isMobile: false },
];

const MOBILE_VIEWPORTS = VIEWPORTS.slice(0, 3);

async function waitForCalendarLoaded(page: Page) {
  // Wait for the calendar header to appear (workspace auto-selected).
  await expect(page.locator('header[aria-label="Calendar controls"]')).toBeVisible({
    timeout: 15_000,
  });
  // Wait for any calendar view content to render. At >= 768px the default
  // is Month view (role="grid"); at < 768px the default is List view
  // (heading "Schedule List").
  await expect(
    page.locator('[role="grid"], h2:has-text("Schedule List")')
  ).toBeVisible({ timeout: 10_000 });
}

async function switchToView(page: Page, view: "Month" | "Week" | "List") {
  const viewGroup = page.locator('[role="group"][aria-label="Calendar view"]');
  await viewGroup.locator(`button:has-text("${view}")`).click();
  await expect(viewGroup.locator(`button[aria-pressed="true"]:has-text("${view}")`)).toBeVisible();
}

test.describe("Calendar responsive E2E", () => {
  test.describe.configure({ timeout: 60_000 });

  test.beforeEach(async ({ page }) => {
    // Login as TL — has team membership and can see the E2E team workspace.
    await loginAsRole(page, "teamLeader");
    await page.goto("/calendar");
    await waitForCalendarLoaded(page);
  });

  for (const vp of VIEWPORTS) {
    test.describe(`viewport: ${vp.name}`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

      test("calendar renders without horizontal overflow", async ({ page }) => {
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
      });

      test("view mode switching works (Month → Week → List → Month)", async ({ page }) => {
        const viewGroup = page.locator('[role="group"][aria-label="Calendar view"]');

        // Switch to Month (may not be default on mobile).
        await switchToView(page, "Month");
        await expect(viewGroup.locator('button[aria-pressed="true"]:has-text("Month")')).toBeVisible();

        // Switch to Week.
        await switchToView(page, "Week");
        await expect(viewGroup.locator('button[aria-pressed="true"]:has-text("Week")')).toBeVisible();

        // Switch to List.
        await switchToView(page, "List");
        await expect(viewGroup.locator('button[aria-pressed="true"]:has-text("List")')).toBeVisible();

        // Switch back to Month.
        await switchToView(page, "Month");
        await expect(viewGroup.locator('button[aria-pressed="true"]:has-text("Month")')).toBeVisible();
      });

      test("prev/next navigation changes the month title", async ({ page }) => {
        const title = page.locator('header[aria-label="Calendar controls"] h1');
        const initialTitle = await title.textContent();

        // Click next month.
        await page.locator('button[aria-label="Next month"]').click();
        await expect(title).not.toHaveText(initialTitle!);

        // Click prev month — should return to the original month.
        await page.locator('button[aria-label="Previous month"]').click();
        await expect(title).toHaveText(initialTitle!);
      });

      test("Today button jumps to the current month", async ({ page }) => {
        const title = page.locator('header[aria-label="Calendar controls"] h1');

        // Navigate away first.
        await page.locator('button[aria-label="Next month"]').click();
        await page.locator('button[aria-label="Next month"]').click();

        // Click Today.
        await page.locator('button:has-text("Today")').click();

        // Title should contain the current year.
        const currentYear = new Date().getFullYear().toString();
        await expect(title).toContainText(currentYear);
      });
    });
  }

  // Mobile-specific behavior: filters button and mobile sidebar.
  for (const vp of MOBILE_VIEWPORTS) {
    test.describe(`mobile filters: ${vp.name}`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

      test("filters button opens the mobile sidebar", async ({ page }) => {
        const filtersButton = page.locator('button[aria-label="Open filters"]');
        await expect(filtersButton).toBeVisible();

        await filtersButton.click();

        // Mobile sidebar should appear.
        const sidebar = page.locator('[role="dialog"][aria-label="Calendar filters"]');
        await expect(sidebar).toBeVisible();

        // Close it.
        await page.locator('button[aria-label="Close filters"]').click();
        await expect(sidebar).not.toBeVisible();
      });
    });
  }
});
