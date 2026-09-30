/**
 * Role-workflow simulation (see docs/superpowers/plans/2026-09-30-role-workflow-simulation.md).
 *
 * A: UI access matrix — per role, every representative route either renders or
 *    redirects exactly as the route guards say, with no uncaught page error.
 * B: API workflows + cross-team isolation — leave request lifecycle across
 *    employee / team leader / HR / admin, on two independent teams.
 * C: DataTable (react-table 9) interactions on real admin/TL pages.
 *
 * Needs the prepared e2e database (`manage.py prepare_e2e_db`, run before the
 * servers boot) — see the plan's Environment section.
 */
import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";
import { E2E_CREDENTIALS, fetchApiToken, loginAsUser, type E2ERole } from "./helpers";

const API = "http://127.0.0.1:8000/api";

// ---------------------------------------------------------------- A: access

type Expectation = "allow" | string; // "allow" = stay on the route; a path = redirected there

const APP = ["/dashboard", "/overtime", "/standby", "/leave-management", "/calendar", "/team", "/settings"];
const TL_ONLY = ["/team/approvals"];
const HR_ONLY = ["/hr/reports", "/hr/team-leaders", "/hr/calendars"];
const ADMIN = ["/admin", "/admin/users", "/admin/teams", "/admin/leave-requests", "/admin/plugins"];

function expectations(role: E2ERole | "superuser" | "controlRoom"): Record<string, Expectation> {
  const out: Record<string, Expectation> = {};
  const cr = role === "controlRoom";
  const tl = role === "teamLeader" || role === "teamLeaderHr" || role === "admin" || role === "superuser";
  const hr = role === "hr" || role === "teamLeaderHr" || role === "admin" || role === "superuser";
  const admin = role === "admin" || role === "superuser";
  for (const p of APP) out[p] = cr && p !== "/settings" ? "/control-room/dashboard" : "allow";
  // DashboardPage sends an admin's selected dashboard to the AdminShell at /admin (intentional).
  if (admin) out["/dashboard"] = "/admin";
  for (const p of TL_ONLY) out[p] = cr ? "/control-room/dashboard" : tl ? "allow" : "/dashboard";
  for (const p of HR_ONLY) out[p] = cr ? "/control-room/dashboard" : hr ? "allow" : "/dashboard";
  for (const p of ADMIN) out[p] = cr ? "/control-room/dashboard" : admin ? "allow" : "/dashboard";
  return out;
}

const ACCESS_ROLES: Array<{
  key: E2ERole | "superuser" | "controlRoom";
  creds: { username: string; password: string };
}> = [
  { key: "employeeA", creds: E2E_CREDENTIALS.employeeA },
  { key: "teamLeader", creds: E2E_CREDENTIALS.teamLeader },
  { key: "hr", creds: E2E_CREDENTIALS.hr },
  { key: "teamLeaderHr", creds: E2E_CREDENTIALS.teamLeaderHr },
  { key: "admin", creds: E2E_CREDENTIALS.admin },
  { key: "superuser", creds: { username: "e2e_super", password: "e2e_pass_2026" } },
  { key: "controlRoom", creds: { username: "e2e_cr", password: "e2e_pass_2026" } },
];

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  // Route guards redirect client-side after auth state resolves.
  await page.waitForTimeout(300);
}

test.describe("A: UI access matrix", () => {
  test.describe.configure({ timeout: 180_000 });

  for (const { key, creds } of ACCESS_ROLES) {
    test(`${key}: routes render or redirect per the guards, without page errors`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      await loginAsUser(page, creds);
      const expected = expectations(key);

      for (const [route, want] of Object.entries(expected)) {
        await page.goto(route);
        await settle(page);
        const finalPath = new URL(page.url()).pathname;
        const wantPath = want === "allow" ? route : want;
        expect.soft(finalPath, `${key} -> ${route}`).toBe(wantPath);
        if (want === "allow") {
          await expect
            .soft(page.getByText(/something went wrong|unexpected error/i), `${key} ${route} error boundary`)
            .toHaveCount(0);
        }
      }
      expect(pageErrors, `${key} uncaught page errors`).toEqual([]);
    });
  }
});

// -------------------------------------------------------------- B: workflows

async function apiAs(creds: { username: string; password: string }): Promise<APIRequestContext> {
  const token = await fetchApiToken(creds);
  return request.newContext({
    baseURL: `${API}/`,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Year that leave requests in this spec target: the year two weeks from today. */
const targetYear = () => {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.getFullYear();
};

/** A Mon+Tue pair in a random week of `targetYear()` at least 14 days out. */
function businessDayPair(): { start_date: string; end_date: string } {
  const earliest = new Date();
  earliest.setDate(earliest.getDate() + 14);
  const weeksLeft = Math.max(
    1,
    Math.floor((new Date(targetYear(), 11, 24).getTime() - earliest.getTime()) / (7 * 86_400_000))
  );
  const date = new Date(earliest);
  date.setDate(date.getDate() + Math.floor(Math.random() * weeksLeft) * 7);
  while (date.getDay() !== 1) date.setDate(date.getDate() + 1);
  const end = new Date(date);
  end.setDate(end.getDate() + 1);
  return { start_date: iso(date), end_date: iso(end) };
}

function weekendPair(): { start_date: string; end_date: string } {
  const date = new Date();
  date.setDate(date.getDate() + 14 + Math.floor(Math.random() * 40) * 7);
  while (date.getDay() !== 6) date.setDate(date.getDate() + 1);
  const end = new Date(date);
  end.setDate(end.getDate() + 1);
  return { start_date: iso(date), end_date: iso(end) };
}

const results = (body: unknown): Array<Record<string, unknown>> =>
  Array.isArray(body) ? body : ((body as { results?: Array<Record<string, unknown>> }).results ?? []);

test.describe.serial("B: leave workflow and cross-team isolation", () => {
  test.describe.configure({ timeout: 120_000 });

  let employeeA: APIRequestContext;
  let employeeC: APIRequestContext;
  let tlA: APIRequestContext;
  let tlB: APIRequestContext;
  let hr: APIRequestContext;
  let admin: APIRequestContext;
  let leaveA = 0;
  let leaveC = 0;
  let leaveC2 = 0;
  let notificationsBefore = 0;
  let notificationsAfterFirstLeave = 0;

  /** Submit a leave request, retrying other weeks if this one overlaps an earlier run's leftover. */
  const submitLeave = async (ctx: APIRequestContext, reason: string) => {
    let last = await ctx.post("leave-management/requests/", {
      data: { request_type: "vacation", reason, ...businessDayPair() },
    });
    for (let attempt = 0; attempt < 10 && last.status() === 400; attempt += 1) {
      if (!/overlap|already/i.test(await last.text())) break;
      last = await ctx.post("leave-management/requests/", {
        data: { request_type: "vacation", reason, ...businessDayPair() },
      });
    }
    return last;
  };

  const usedDays = async (ctx: APIRequestContext) => {
    const response = await ctx.get("leave-management/balances/?page_size=500");
    expect(response.status()).toBe(200);
    return results(await response.json()).reduce((sum, row) => sum + Number(row.used_days ?? 0), 0);
  };

  const notificationCount = async (ctx: APIRequestContext) => {
    const response = await ctx.get("plugins/notifications/notifications/?page_size=1000");
    expect(response.status()).toBe(200);
    const body = await response.json();
    return typeof body.count === "number" ? (body.count as number) : results(body).length;
  };

  test.beforeAll(async () => {
    employeeA = await apiAs(E2E_CREDENTIALS.employeeA);
    employeeC = await apiAs({ username: "e2e_employee_c", password: "e2e_pass_2026" });
    tlA = await apiAs(E2E_CREDENTIALS.teamLeader);
    tlB = await apiAs({ username: "e2e_tl_b", password: "e2e_pass_2026" });
    hr = await apiAs(E2E_CREDENTIALS.hr);
    admin = await apiAs(E2E_CREDENTIALS.admin);
  });

  test.afterAll(async () => {
    for (const [ctx, id] of [
      [admin, leaveA],
      [admin, leaveC],
      [admin, leaveC2],
    ] as const) {
      if (id) await ctx.delete(`leave-management/requests/${id}/`).catch(() => undefined);
    }
    await Promise.all([employeeA, employeeC, tlA, tlB, hr, admin].map((c) => c?.dispose()));
  });

  test("weekend-only leave is rejected (business-day rule)", async () => {
    const response = await employeeA.post("leave-management/requests/", {
      data: { request_type: "vacation", reason: "weekend only", ...weekendPair() },
    });
    expect(response.status()).toBe(400);
  });

  test("employees on both teams can submit valid leave", async () => {
    const a = await submitLeave(employeeA, "team A e2e");
    expect(a.status(), await a.text()).toBe(201);
    leaveA = (await a.json()).id;
    expect((await a.json()).status).toBe("pending");

    notificationsBefore = await notificationCount(employeeC);
    const c = await submitLeave(employeeC, "team B e2e");
    expect(c.status(), await c.text()).toBe(201);
    leaveC = (await c.json()).id;
    notificationsAfterFirstLeave = await notificationCount(employeeC);

    const c2 = await submitLeave(employeeC, "team B e2e (HR)");
    expect(c2.status(), await c2.text()).toBe(201);
    leaveC2 = (await c2.json()).id;
  });

  test("creating a leave request sends exactly one notification", async () => {
    // Regression for the double-dispatch bug: LeaveRequest.save() saves twice on
    // creation and the second save used to fire a spurious "edited" notification.
    expect(notificationsAfterFirstLeave).toBe(notificationsBefore + 1);
  });

  test("visibility is scoped: employee sees own, each TL sees only their team", async () => {
    const ids = async (ctx: APIRequestContext, path: string) => {
      const r = await ctx.get(path);
      expect(r.status(), path).toBe(200);
      return results(await r.json()).map((row) => row.id as number);
    };
    const [a, c] = [
      await ids(employeeA, "leave-management/requests/?page_size=500"),
      await ids(employeeC, "leave-management/requests/?page_size=500"),
    ];
    expect(a).toContain(leaveA);
    expect(a).not.toContain(leaveC);
    expect(c).toContain(leaveC);
    expect(c).not.toContain(leaveA);

    // A TL's team view is a dedicated action (the base list is their own records).
    const [tA, tB] = [
      await ids(tlA, "leave-management/requests/team_logs/?page_size=500"),
      await ids(tlB, "leave-management/requests/team_logs/?page_size=500"),
    ];
    expect(tA).toContain(leaveA);
    expect(tA, "TL A must not see Team B's leave").not.toContain(leaveC);
    expect(tB).toContain(leaveC);
    expect(tB, "TL B must not see Team A's leave").not.toContain(leaveA);

    // Employees have no team view at all.
    expect((await employeeA.get("leave-management/requests/team_logs/")).status()).toBe(403);
  });

  test("a TL cannot approve another team's leave, nor can an employee approve anything", async () => {
    const crossTeam = await tlB.post(`leave-management/requests/${leaveA}/approve/`);
    expect([403, 404]).toContain(crossTeam.status());
    const byEmployee = await employeeC.post(`leave-management/requests/${leaveA}/approve/`);
    expect([403, 404]).toContain(byEmployee.status());

    const still = await admin.get(`leave-management/requests/${leaveA}/`);
    expect((await still.json()).status).toBe("pending");
  });

  test("the owning TL approves; the employee sees it approved and the balance is deducted once", async () => {
    const usedBefore = await usedDays(employeeA);
    const approve = await tlA.post(`leave-management/requests/${leaveA}/approve/`);
    expect(approve.status(), await approve.text()).toBe(200);
    const approved = await approve.json();
    expect(approved.status).toBe("approved");

    const mine = await employeeA.get(`leave-management/requests/${leaveA}/`);
    expect((await mine.json()).status).toBe("approved");
    // Monday + Tuesday = 2 business days, deducted exactly once.
    expect((await usedDays(employeeA)) - usedBefore).toBe(Number(approved.days_requested));
    expect(Number(approved.days_requested)).toBe(2);
  });

  test("admin sees both teams' leave", async () => {
    const adminIds = results(await (await admin.get("leave-management/requests/?page_size=500")).json()).map(
      (row) => row.id
    );
    expect(adminIds).toEqual(expect.arrayContaining([leaveA, leaveC, leaveC2]));
  });

  test("reject requires the owning TL", async () => {
    const wrongTl = await tlA.post(`leave-management/requests/${leaveC}/reject/`, {
      data: { rejection_reason: "not my team" },
    });
    expect([403, 404]).toContain(wrongTl.status());

    const rightTl = await tlB.post(`leave-management/requests/${leaveC}/reject/`, {
      data: { rejection_reason: "coverage" },
    });
    expect(rightTl.status(), await rightTl.text()).toBe(200);
    const rejected = await (await employeeC.get(`leave-management/requests/${leaveC}/`)).json();
    expect(rejected.status).toBe("rejected");
    expect(rejected.rejection_reason).toBe("coverage");
  });

  test("HR may approve (documented) but is write-blocked from creating leave", async () => {
    // HRReadOnlyMixin: "They can still approve/reject requests"; create/update/destroy are blocked.
    const create = await hr.post("leave-management/requests/", {
      data: { request_type: "vacation", reason: "hr create", ...businessDayPair() },
    });
    expect(create.status()).toBe(403);

    const approve = await hr.post(`leave-management/requests/${leaveC2}/approve/`);
    expect(approve.status(), await approve.text()).toBe(200);
  });
});
// ------------------------------------------------------- C: DataTable in-app

test.describe("C: DataTable (react-table 9) on real pages", () => {
  test.describe.configure({ timeout: 90_000 });

  test("admin users table: search filters, sort toggles, select-all selects the page", async ({ page }) => {
    await loginAsUser(page, E2E_CREDENTIALS.admin);
    await page.goto("/admin/users");
    await settle(page);

    const table = page.locator("table").first();
    await expect(table).toBeVisible();
    const rowsBefore = await table.locator("tbody tr").count();
    expect(rowsBefore).toBeGreaterThan(3);

    await page.getByPlaceholder(/search/i).first().fill("e2e_employee_c");
    await expect.poll(async () => table.locator("tbody tr").count()).toBeLessThan(rowsBefore);
    await expect(table.locator("tbody")).toContainText("e2e_employee_c");
    await page.getByPlaceholder(/search/i).first().fill("");
    await expect.poll(async () => table.locator("tbody tr").count()).toBe(rowsBefore);

    const sortButton = table.locator("thead th button[aria-label^='Sort by']").first();
    await sortButton.click();
    await expect(table.locator("thead th[aria-sort='ascending'], thead th[aria-sort='descending']").first())
      .toBeVisible();

    await page.getByLabel("Select all rows on this page").click();
    const boxes = page.getByRole("checkbox", { name: "Select row" });
    const total = await boxes.count();
    expect(total).toBeGreaterThan(0);
    for (let i = 0; i < total; i += 1) await expect(boxes.nth(i)).toBeChecked();
  });

  test("team leader approvals page renders its table for the TL's own team only", async ({ page }) => {
    await loginAsUser(page, E2E_CREDENTIALS.teamLeader);
    await page.goto("/team/approvals");
    await settle(page);
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    await expect(page.locator("main, [role='main']").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("e2e_employee_c");
  });
});
