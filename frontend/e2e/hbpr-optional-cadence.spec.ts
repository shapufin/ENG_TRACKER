/**
 * HBPR assignment without a cadence: the admin leaves the schedule open, the
 * assigned Line Manager sees the prompt, sets it, and the prompt goes away.
 *
 * The fixture is a Line Manager and an assignment this spec owns (a probe user
 * per run), so it never touches the seeded `e2e_tl_b` pairing, and the `chromium` and `mobile-chromium` projects run
 * this file concurrently. The assignment is ended in `afterAll`.
 */
import { expect, request, test, type APIRequestContext } from "@playwright/test";
import { E2E_CREDENTIALS, fetchApiToken, loginAsUser } from "./helpers";

const API_ORIGIN = "http://127.0.0.1:8000";
const PROBE_PASSWORD = "Probe-pass-2026!x";

interface ApiRow {
  id: number;
  username?: string;
}

let ctx: APIRequestContext;
let username = "";
let assignmentId = 0;
let assignmentStart = "";

const asList = (data: unknown): ApiRow[] =>
  Array.isArray(data) ? (data as ApiRow[]) : ((data as { results?: ApiRow[] })?.results ?? []);

test.describe.configure({ mode: "serial", timeout: 180_000 });

test.beforeAll(async () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  username = `cadprobe_${suffix}`;
  // January 1st of the business year is always in the past for the server.
  assignmentStart = `${new Date().getUTCFullYear()}-01-01`;

  const token = await fetchApiToken(E2E_CREDENTIALS.admin);
  ctx = await request.newContext({
    baseURL: API_ORIGIN,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });

  const created = await ctx.post("/api/users/users/create_user/", {
    data: {
      username,
      email: `${username}@example.com`,
      first_name: "Cadence",
      last_name: "Probe",
      password: PROBE_PASSWORD,
      is_albanian_tl_role: true,
    },
  });
  expect(created.ok(), "creating the probe Line Manager must succeed").toBeTruthy();
  const lmId = ((await created.json()) as { id: number }).id;

  const hbpr = asList(
    await (await ctx.get("/api/users/users/", { params: { search: "e2e_hbpr" } })).json()
  ).find((row) => row.username === "e2e_hbpr");
  expect(hbpr, "the seeded HBPR must exist").toBeDefined();

  // No `cadence` key at all: the admin chose "Set later by the Line Manager".
  const assignment = await ctx.post("/api/users/hbpr-assignments/", {
    data: { hbpr: hbpr!.id, albanian_tl: lmId, effective_from: assignmentStart },
  });
  expect(assignment.status(), "an assignment without a cadence must be accepted").toBe(201);
  const body = (await assignment.json()) as {
    id: number;
    cadence: string | null;
    cadence_status: string;
    cadence_display: string;
  };
  assignmentId = body.id;
  expect(body.cadence).toBeNull();
  expect(body.cadence_status).toBe("cadence_not_set");
  expect(body.cadence_display).toBe("Not set");
});

test.afterAll(async () => {
  if (ctx) {
    // Close the probe range on its first day so it never counts as current.
    if (assignmentId) {
      await ctx
        .post(`/api/users/hbpr-assignments/${assignmentId}/end/`, {
          data: { effective_to: assignmentStart },
        })
        .catch(() => undefined);
    }
    await ctx.dispose();
  }
});

test("the Line Manager sees the prompt, sets a cadence, and the prompt disappears", async ({
  page,
}) => {
  await loginAsUser(page, { username, password: PROBE_PASSWORD });
  await page.goto("/tl-scorecard?tab=evidence");
  await page.waitForLoadState("networkidle").catch(() => undefined);

  const prompt = page.getByText("Set your HBPR meeting cadence");
  await expect(prompt).toBeVisible();

  await page.getByRole("button", { name: "Set cadence" }).first().click();
  const dialog = page.getByRole("dialog", { name: /meeting schedule/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox", { name: "Meeting cadence" }).click();
  await page.getByRole("option", { name: "Weekly", exact: true }).click();
  await dialog.getByRole("button", { name: "Save schedule" }).click();

  await expect(prompt).toHaveCount(0);

  // The server now reports a schedule, so a reload keeps the prompt away.
  await page.reload();
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await expect(page.getByText("Set your HBPR meeting cadence")).toHaveCount(0);
});

test("an admin can clear the cadence and the prompt returns", async ({ page }) => {
  const cleared = await ctx.patch(`/api/users/hbpr-assignments/${assignmentId}/`, {
    data: { cadence: null },
  });
  expect(cleared.ok(), "an admin clearing the cadence must be accepted").toBeTruthy();
  const body = (await cleared.json()) as { cadence: string | null; cadence_status: string };
  expect(body.cadence).toBeNull();
  expect(body.cadence_status).toBe("cadence_not_set");

  await loginAsUser(page, { username, password: PROBE_PASSWORD });
  await page.goto("/tl-scorecard?tab=evidence");
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await expect(page.getByText("Set your HBPR meeting cadence")).toBeVisible();
});
