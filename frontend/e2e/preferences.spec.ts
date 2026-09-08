import { expect, test } from "@playwright/test";
import { E2E_CREDENTIALS, loginAsUser } from "./helpers";

const PREFERENCES_URL =
  "http://127.0.0.1:8000/api/plugins/notifications/notifications/preferences/";

async function fetchPreferences(page: import("@playwright/test").Page) {
  return page.evaluate(async (url) => {
    const token = localStorage.getItem("access_token");
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    return { status: response.status, body: await response.json() };
  }, PREFERENCES_URL);
}

test.describe("Role-aware notification preferences", () => {
  test.describe.configure({ timeout: 45_000 });

  test("employee sees only personal categories", async ({ page }) => {
    await loginAsUser(page, E2E_CREDENTIALS.employeeA);
    const result = await fetchPreferences(page);
    expect(result.status).toBe(200);
    expect(
      result.body.some((item: { event_type: string }) => item.event_type === "team_action_required")
    ).toBe(false);
    expect(
      result.body.some((item: { event_type: string }) => item.event_type === "own_leave_updated")
    ).toBe(true);
  });

  for (const role of ["teamLeader", "hr", "admin", "teamLeaderHr"] as const) {
    test(`${role} sees team categories`, async ({ page }) => {
      await loginAsUser(page, E2E_CREDENTIALS[role]);
      const result = await fetchPreferences(page);
      expect(result.status).toBe(200);
      expect(
        result.body.some(
          (item: { event_type: string }) => item.event_type === "team_action_required"
        )
      ).toBe(true);
      expect(
        result.body.some((item: { event_type: string }) => item.event_type === "team_leave_deleted")
      ).toBe(true);
    });
  }

  test("in-app and push channels update independently", async ({ page }) => {
    await loginAsUser(page, E2E_CREDENTIALS.employeeA);
    const token = await page.evaluate(() => localStorage.getItem("access_token"));
    const response = await page.evaluate(
      async ({ url, token }) => {
        const patch = await fetch(url, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            event_type: "own_leave_updated",
            in_app_enabled: false,
            push_enabled: true,
          }),
        });
        return { status: patch.status, body: await patch.json() };
      },
      { url: PREFERENCES_URL, token }
    );
    expect(response.status).toBe(200);
    expect(
      response.body.find((item: { event_type: string }) => item.event_type === "own_leave_updated")
    ).toMatchObject({
      in_app_enabled: false,
      push_enabled: true,
    });
  });
});
