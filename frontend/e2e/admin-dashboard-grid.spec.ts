import { expect, test, type Locator, type Page } from "@playwright/test";
import { loginAsRole } from "./helpers";

const cell = (page: Page, id: string) => page.locator(`[data-grid-cell="${id}"]`);

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error("element has no bounding box");
  return b;
}

async function enterEditMode(page: Page) {
  await page.getByRole("button", { name: "Edit layout" }).click();
  await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
}

async function resetToDefault(page: Page) {
  await page.getByRole("button", { name: "Dashboard actions" }).click();
  await page.getByRole("menuitem", { name: /reset to default/i }).click();
  await page.getByRole("button", { name: "Reset layout" }).click();
  await expect(page.getByText("Dashboard reset to default")).toBeVisible();
}

test.describe("Admin dashboard grid", () => {
  test.describe.configure({ timeout: 90_000 });

  test.beforeEach(async ({ page }) => {
    await loginAsRole(page, "admin");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Admin Dashboard" })).toBeVisible();
    await expect(cell(page, "kpi-strip")).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    // Leave the fixture admin on the default layout for the next spec.
    await page.goto("/admin");
    await page.getByRole("button", { name: "Dashboard actions" }).click();
    await page.getByRole("menuitem", { name: /reset to default/i }).click();
    await page.getByRole("button", { name: "Reset layout" }).click();
  });

  test("handles exist only in edit mode", async ({ page }) => {
    await expect(page.getByRole("button", { name: /^Move / })).toHaveCount(0);
    // The grid keeps its (hidden) handles in the DOM outside edit mode; none may be visible.
    await expect(page.locator(".react-resizable-handle:visible")).toHaveCount(0);
    await enterEditMode(page);
    await expect(page.locator(".react-resizable-handle:visible").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Move / }).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Edit layout" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Move / })).toHaveCount(0);
  });

  test("drag by the grip moves a widget and the position survives a reload", async ({ page }) => {
    await enterEditMode(page);
    const before = await box(cell(page, "shortcuts"));
    const grip = page.getByRole("button", { name: "Move Shortcuts" });
    const g = await box(grip);
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(g.x + g.width / 2, g.y - 400, { steps: 12 });
    await page.mouse.up();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    const moved = await box(cell(page, "shortcuts"));
    expect(moved.y).toBeLessThan(before.y);

    await page.reload();
    await expect(cell(page, "shortcuts")).toBeVisible();
    const reloaded = await box(cell(page, "shortcuts"));
    expect(Math.abs(reloaded.y - moved.y)).toBeLessThan(4);
  });

  test("resizing with the corner handle changes the widget height and persists", async ({
    page,
  }) => {
    await enterEditMode(page);
    const target = cell(page, "approval-queue");
    const before = await box(target);
    const handle = target.locator(".react-resizable-handle");
    const h = await box(handle);
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2, h.y + 160, { steps: 12 });
    await page.mouse.up();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    const after = await box(target);
    expect(after.height).toBeGreaterThan(before.height + 40);

    await page.reload();
    const reloaded = await box(cell(page, "approval-queue"));
    expect(Math.abs(reloaded.height - after.height)).toBeLessThan(4);
  });

  test("keyboard: Alt+Arrow on the grip moves a widget and announces it", async ({ page }) => {
    await enterEditMode(page);
    await page.getByRole("button", { name: "Move Hours" }).focus();
    await page.keyboard.press("Alt+ArrowDown");
    await expect(
      page.getByRole("status").filter({ hasText: /Moved Hours to column/ })
    ).toBeVisible();
  });

  test("reset restores the default layout and Undo brings the edit back", async ({ page }) => {
    await enterEditMode(page);
    const grip = page.getByRole("button", { name: "Move Shortcuts" });
    const g = await box(grip);
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(g.x + g.width / 2, g.y - 400, { steps: 12 });
    await page.mouse.up();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    const edited = await box(cell(page, "shortcuts"));

    await resetToDefault(page);
    await expect.poll(async () => (await box(cell(page, "shortcuts"))).y).toBeGreaterThan(edited.y);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect
      .poll(async () => Math.abs((await box(cell(page, "shortcuts"))).y - edited.y))
      .toBeLessThan(4);
  });

  test("Edit layout is disabled off the All tab", async ({ page }) => {
    await page.goto("/admin?section=trends");
    const button = page.getByRole("button", { name: "Edit layout" });
    await expect(button).toHaveAttribute("aria-disabled", "true");
    await expect(button).toHaveAttribute("title", "Switch to All to rearrange widgets");
  });
});

test.describe("Admin dashboard grid responsiveness", () => {
  test.describe.configure({ timeout: 60_000 });

  for (const width of [375, 768, 1280, 1920]) {
    test(`no horizontal scroll at ${width}px`, async ({ page }) => {
      await loginAsRole(page, "admin");
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/admin");
      await expect(page.getByRole("heading", { name: "Admin Dashboard" })).toBeVisible();
      await expect(cell(page, "kpi-strip")).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("375px shows a plain stack with no drag or resize handles", async ({ page }) => {
    await loginAsRole(page, "admin");
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/admin");
    await expect(cell(page, "kpi-strip")).toBeVisible();
    await expect(page.locator("[data-grid-mode]")).toHaveAttribute("data-grid-mode", "stack");
    await expect(page.getByRole("button", { name: "Edit layout" })).toBeHidden();
    await expect(page.locator(".react-resizable-handle")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Move / })).toHaveCount(0);
    // One column: every cell has the same left edge.
    const lefts = await page
      .locator("[data-grid-cell]")
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().left)));
    expect(new Set(lefts).size).toBe(1);
  });
});
