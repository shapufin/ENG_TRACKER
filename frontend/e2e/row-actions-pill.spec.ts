/**
 * Row-actions pill behaviour against the real stack.
 *
 * Desktop (fine pointer): icon-only action cells float in a hover pill and the
 * Actions column collapses. Mobile (coarse pointer): the Actions column stays.
 * Approval decisions keep a visible Approve control without hover.
 */
import { expect, test } from "@playwright/test";
import { E2E_CREDENTIALS, loginAsUser } from "./helpers";

const opacityOf = (locator: import("@playwright/test").Locator) =>
  locator.evaluate((el) => getComputedStyle(el).opacity);

test.describe("row actions pill", () => {
  test("admin users: pill reveals on row hover and the Actions column collapses on fine pointers", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "fine-pointer behaviour is desktop-only");
    await loginAsUser(page, E2E_CREDENTIALS.admin);
    await page.goto("/admin/users");

    const table = page.locator("table").first();
    await expect(table).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Actions" })).toHaveCount(0);

    const row = table
      .locator("tbody tr")
      .filter({ has: page.getByRole("toolbar") })
      .first();
    const toolbar = row.getByRole("toolbar", { name: "Row actions" });
    await expect(toolbar).toHaveCount(1);
    expect(await opacityOf(toolbar)).toBe("0");

    await row.hover();
    await expect.poll(() => opacityOf(toolbar)).toBe("1");

    await page.mouse.move(0, 0);
    await expect.poll(() => opacityOf(toolbar)).toBe("0");
  });

  test("admin users: row actions stay reachable by keyboard focus", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "fine-pointer behaviour is desktop-only");
    await loginAsUser(page, E2E_CREDENTIALS.admin);
    await page.goto("/admin/users");

    const firstAction = page
      .getByRole("toolbar", { name: "Row actions" })
      .first()
      .getByRole("button")
      .first();
    await firstAction.focus();
    const toolbar = page.getByRole("toolbar", { name: "Row actions" }).first();
    await expect.poll(() => opacityOf(toolbar)).toBe("1");
  });

  test("coarse pointer (mobile) keeps the Actions column and no pill", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "coarse-pointer path is mobile-only");
    await loginAsUser(page, E2E_CREDENTIALS.admin);
    await page.goto("/admin/users");

    await expect(page.locator("table").first()).toBeVisible();
    await expect(page.getByRole("toolbar", { name: "Row actions" })).toHaveCount(0);
  });

  test("team approvals: pending Approve stays visible without hover", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "fine-pointer behaviour is desktop-only");
    await loginAsUser(page, E2E_CREDENTIALS.teamLeader);
    await page.goto("/team/approvals");

    const approve = page.getByRole("button", { name: /^Approve / }).first();
    test.skip((await approve.count()) === 0, "no pending rows in the e2e fixture");
    await expect(approve).toBeVisible();
    expect(await opacityOf(approve)).toBe("1");
  });
});
