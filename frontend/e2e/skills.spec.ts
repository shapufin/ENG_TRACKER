import { expect, test } from "@playwright/test";
import { E2E_CREDENTIALS, loginAsUser, logoutViaUI } from "./helpers";

const API_BASE = "http://127.0.0.1:8000/api";

// The SPA keeps the JWT access token in memory only (lib/api.ts) — it is
// NOT in localStorage. Authenticate via the public token endpoint instead.
async function getApiToken(page: import("@playwright/test").Page): Promise<string> {
  const response = await page.request.post(`${API_BASE}/auth/token/`, {
    data: E2E_CREDENTIALS.admin,
  });
  if (!response.ok()) throw new Error(`API login failed: ${response.status()}`);
  return ((await response.json()) as { access: string }).access;
}

async function apiRequest(
  page: import("@playwright/test").Page,
  method: "GET" | "POST",
  url: string,
  token: string,
  body?: unknown
) {
  const response = await page.request.fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: body ? JSON.stringify(body) : undefined,
  });
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return { status: response.status(), body: json };
}

async function ensureSkillsData(page: import("@playwright/test").Page) {
  const token = await getApiToken(page);
  // Create a category (idempotent — if it exists, the 400 is fine).
  // code is auto-generated from the uppercased name; display_order is no
  // longer a serializer field. Send only accepted fields.
  await apiRequest(page, "POST", `${API_BASE}/plugins/skills/categories/`, token, {
    name: "E2E Backend",
    description: "E2E test category",
    is_active: true,
  });
  // Fetch categories to get the ID. The serializer uppercases the name and
  // auto-generates code from it, so look up by name (stable identifier).
  const cats = await apiRequest(page, "GET", `${API_BASE}/plugins/skills/categories/`, token);
  const categoryId = (
    cats.body as { results?: { id: number; name: string }[] } | null
  )?.results?.find((c) => c.name.toUpperCase() === "E2E BACKEND")?.id;
  if (!categoryId) throw new Error("Could not resolve E2E category ID");

  // Create a skill (idempotent). code is auto-generated; target_level and
  // display_order are no longer serializer fields.
  await apiRequest(page, "POST", `${API_BASE}/plugins/skills/skills/`, token, {
    name: "E2E Python",
    category: categoryId,
    description: "",
    is_active: true,
  });

  return categoryId;
}

test.describe("Skills pages", () => {
  test.describe.configure({ timeout: 60_000 });

  test("admin can view the Skills Catalog with categories and skills", async ({ page }) => {
    await loginAsUser(page, E2E_CREDENTIALS.admin);
    await ensureSkillsData(page);

    await page.goto("/admin/skills/catalog");

    // The catalog page title should be visible.
    await expect(page.getByRole("heading", { name: /Skills Catalog/i })).toBeVisible({
      timeout: 15_000,
    });

    // The E2E category should appear.
    await expect(page.getByText("E2E Backend")).toBeVisible({ timeout: 10_000 });
  });

  test("team leader can view the Team Skills matrix on desktop", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Desktop-only coverage");
    // Catalog writes are HR/admin-only. Seed with an admin session, then verify
    // the team-leader read surface with a separate authenticated session.
    await loginAsUser(page, E2E_CREDENTIALS.admin);
    await ensureSkillsData(page);
    await logoutViaUI(page);
    await loginAsUser(page, E2E_CREDENTIALS.teamLeader);

    await page.goto("/skills/team");

    await expect(page.getByRole("heading", { name: /Team Skills/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("grid", { name: /Skills matrix/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("group", { name: "Skills view" })).toBeVisible();
  });

  test("team leader sees member cards instead of the matrix on mobile viewport", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Mobile-only coverage");
    await loginAsUser(page, E2E_CREDENTIALS.admin);
    await ensureSkillsData(page);
    await logoutViaUI(page);
    await loginAsUser(page, E2E_CREDENTIALS.teamLeader);
    await page.setViewportSize({ width: 393, height: 844 });

    await page.goto("/skills/team");

    await expect(page.getByRole("heading", { name: /Team Skills/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: "Filters" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByLabel(/scroll horizontally/i)).not.toBeAttached();
  });

  test("employee can view My Skills page", async ({ page }) => {
    await loginAsUser(page, E2E_CREDENTIALS.employeeA);

    await page.goto("/skills");

    // The My Skills page title should be visible.
    await expect(page.getByRole("heading", { name: /My Skills/i })).toBeVisible({
      timeout: 15_000,
    });

    // The Add Skill button should be present.
    await expect(page.getByRole("button", { name: /Add Skill/i })).toBeVisible();
  });

  test("team leader can view Skill History page", async ({ page }) => {
    await loginAsUser(page, E2E_CREDENTIALS.teamLeader);

    await page.goto("/skills/history");

    // The Skill History page title should be visible.
    await expect(page.getByRole("heading", { name: /Skill History/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("no horizontal overflow at 320px width on Team Skills", async ({ page }) => {
    await loginAsUser(page, E2E_CREDENTIALS.teamLeader);
    await ensureSkillsData(page);

    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/skills/team");

    await expect(page.getByRole("heading", { name: /Team Skills/i })).toBeVisible({
      timeout: 15_000,
    });

    // Wait for content to settle.
    await page.waitForTimeout(1000);

    // Check that the page does not overflow horizontally.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // +1 for rounding
  });

  test("My Skills page stat cards are visible and readable for employee", async ({ page }) => {
    await loginAsUser(page, E2E_CREDENTIALS.employeeA);
    await page.goto("/skills");
    await expect(page.getByRole("heading", { name: /My Skills/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Rated skills/i)).toBeVisible();
    await expect(page.getByText(/Average level/i)).toBeVisible();
  });

  test("KPI cards visible on team skills page for TL", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Desktop-only coverage");
    await loginAsUser(page, E2E_CREDENTIALS.admin);
    await ensureSkillsData(page);
    await logoutViaUI(page);
    await loginAsUser(page, E2E_CREDENTIALS.teamLeader);
    await page.goto("/skills/team");
    await expect(page.getByRole("heading", { name: /Team Skills/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText(/Team Seniority/i).or(page.getByText(/Strongest Domain/i))
    ).toBeVisible({ timeout: 10_000 });
  });

  test("catalog split-pane: category sidebar sticky on desktop", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Desktop-only coverage");
    await loginAsUser(page, E2E_CREDENTIALS.admin);
    await ensureSkillsData(page);
    await page.goto("/admin/skills/catalog");
    await expect(page.getByRole("heading", { name: /Skills Catalog/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Categories")).toBeVisible();
  });

  test("skill history page filter bar renders for TL", async ({ page }) => {
    await loginAsUser(page, E2E_CREDENTIALS.teamLeader);
    await page.goto("/skills/history");
    await expect(page.getByRole("heading", { name: /Skill History/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Skill/i).first()).toBeVisible();
  });

  test("no horizontal overflow at 393px on My Skills page", async ({ page }) => {
    await loginAsUser(page, E2E_CREDENTIALS.employeeA);
    await page.setViewportSize({ width: 393, height: 844 });
    await page.goto("/skills");
    await expect(page.getByRole("heading", { name: /My Skills/i })).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForTimeout(800);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
