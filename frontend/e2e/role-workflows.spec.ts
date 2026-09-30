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
import { mkdirSync, writeFileSync } from "node:fs";
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

// ------------------------------------------- D: every plugin route x every role

// From each plugin's get_frontend_metadata() routes (parameterised routes excluded).
const PLUGIN_ROUTES = [
  "/analytics", "/admin/analytics",
  "/admin/audit-logs",
  "/control-room/dashboard", "/control-room/access", "/admin/control-room/access",
  "/admin/data-import",
  "/engagement/metrics", "/engagement/visualize", "/admin/engagement",
  "/notifications",
  "/onboarding",
  "/organigrama", "/admin/organigrama",
  "/admin/payroll/wages", "/admin/payroll/runs", "/admin/payroll/calendar", "/admin/payroll/settings",
  "/hr/payroll/runs", "/hr/payroll/wages",
  "/admin/backup-restore",
  "/skills", "/skills/team", "/skills/history", "/admin/skills/catalog", "/admin/skills/settings",
  "/ticket-kpi/upload", "/ticket-kpi/dashboard", "/ticket-kpi/team", "/ticket-kpi/team-management",
  "/admin/ticket-kpi/mappings",
  "/tl-scorecard", "/tl-scorecard/visualize", "/admin/tl-scorecard",
];

test.describe("D: plugin routes x roles (smoke + observed access table)", () => {
  test.describe.configure({ timeout: 300_000 });

  for (const { key, creds } of ACCESS_ROLES) {
    test(`${key}: no plugin route crashes; access boundaries hold`, async ({ page }, testInfo) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(`${page.url()} :: ${error.message}`));

      await loginAsUser(page, creds);
      const observed: Record<string, string> = {};
      for (const route of PLUGIN_ROUTES) {
        await page.goto(route);
        await settle(page);
        const finalPath = new URL(page.url()).pathname;
        observed[route] = finalPath === route ? "allow" : `-> ${finalPath}`;
        if (finalPath === route) {
          await expect
            .soft(page.getByText(/something went wrong|unexpected error/i), `${key} ${route} error boundary`)
            .toHaveCount(0);
        }
      }
      // Playwright wipes test-results/ on every run, so keep the observed table elsewhere.
      mkdirSync("e2e-observed", { recursive: true });
      writeFileSync(
        `e2e-observed/plugin-access-${key}-${testInfo.project.name}.json`,
        JSON.stringify(observed, null, 2)
      );
      await testInfo.attach(`plugin-access-${key}.json`, {
        body: JSON.stringify(observed, null, 2),
        contentType: "application/json",
      });

      const stayed = (prefix: string) =>
        Object.entries(observed).filter(([route, v]) => route.startsWith(prefix) && v === "allow");
      if (key === "admin" || key === "superuser") {
        const blocked = PLUGIN_ROUTES.filter((r) => r.startsWith("/admin/") && observed[r] !== "allow");
        expect(blocked, `${key} must reach every /admin plugin page`).toEqual([]);
      }
      if (key === "employeeA" || key === "teamLeader") {
        expect(stayed("/admin/"), `${key} must not stay on /admin/*`).toEqual([]);
        expect(stayed("/hr/"), `${key} must not stay on /hr/*`).toEqual([]);
      }
      if (key === "hr") {
        expect(stayed("/admin/"), "pure HR must not stay on /admin/*").toEqual([]);
      }
      expect(pageErrors, `${key} uncaught page errors`).toEqual([]);
    });
  }
});

// ------------------------------- E: overtime lifecycle, isolation, monthly lock

test.describe.serial("E: overtime lifecycle, cross-team isolation and the monthly lock", () => {
  test.describe.configure({ timeout: 120_000 });

  let employeeA: APIRequestContext;
  let employeeC: APIRequestContext;
  let tlA: APIRequestContext;
  let tlB: APIRequestContext;
  let admin: APIRequestContext;
  let superuser: APIRequestContext;
  let clientId = 0;
  const created: number[] = [];
  let otA = 0;
  let otC = 0;
  let lockedA = 0;

  const today = () => iso(new Date());
  const previousMonthDay = () => {
    const d = new Date();
    return iso(new Date(d.getFullYear(), d.getMonth() - 1, 10, 12));
  };
  const log = (date: string, description: string) => ({ date, hours: 2, description, client: clientId });

  test.beforeAll(async () => {
    employeeA = await apiAs(E2E_CREDENTIALS.employeeA);
    employeeC = await apiAs({ username: "e2e_employee_c", password: "e2e_pass_2026" });
    tlA = await apiAs(E2E_CREDENTIALS.teamLeader);
    tlB = await apiAs({ username: "e2e_tl_b", password: "e2e_pass_2026" });
    admin = await apiAs(E2E_CREDENTIALS.admin);
    superuser = await apiAs({ username: "e2e_super", password: "e2e_pass_2026" });

    const clients = results(await (await employeeA.get("overtime/clients/")).json());
    const e2eClient = clients.find((c) => c.code === "E2E");
    expect(e2eClient, "E2E client visible to a fixture employee").toBeTruthy();
    clientId = e2eClient!.id as number;
  });

  test.afterAll(async () => {
    for (const id of created) await superuser.delete(`overtime/logs/${id}/`).catch(() => undefined);
    await Promise.all([employeeA, employeeC, tlA, tlB, admin, superuser].map((c) => c?.dispose()));
  });

  test("employees on both teams can log overtime for today", async () => {
    const a = await employeeA.post("overtime/logs/", { data: log(today(), "e2e team A") });
    expect(a.status(), await a.text()).toBe(201);
    otA = (await a.json()).id;
    const c = await employeeC.post("overtime/logs/", { data: log(today(), "e2e team B") });
    expect(c.status(), await c.text()).toBe(201);
    otC = (await c.json()).id;
    created.push(otA, otC);
  });

  test("team views are scoped per team; employees have none", async () => {
    const ids = async (ctx: APIRequestContext) => {
      const r = await ctx.get("overtime/logs/team_logs/?page_size=500");
      expect(r.status()).toBe(200);
      return results(await r.json()).map((row) => row.id as number);
    };
    const [a, b] = [await ids(tlA), await ids(tlB)];
    expect(a).toContain(otA);
    expect(a, "TL A must not see Team B overtime").not.toContain(otC);
    expect(b).toContain(otC);
    expect(b, "TL B must not see Team A overtime").not.toContain(otA);
    expect((await employeeA.get("overtime/logs/team_logs/")).status()).toBe(403);
    // An employee's own list never includes a colleague's log.
    const own = results(await (await employeeA.get("overtime/logs/?page_size=500")).json()).map((r) => r.id);
    expect(own).toContain(otA);
    expect(own).not.toContain(otC);
  });

  test("only the owning TL can approve", async () => {
    expect([403, 404]).toContain((await tlB.post(`overtime/logs/${otA}/approve/`)).status());
    expect([403, 404]).toContain((await employeeC.post(`overtime/logs/${otA}/approve/`)).status());
    const ok = await tlA.post(`overtime/logs/${otA}/approve/`);
    expect(ok.status(), await ok.text()).toBe(200);
    expect((await (await employeeA.get(`overtime/logs/${otA}/`)).json()).status).toBe("approved");
  });

  test("monthly lock: owner updates frozen in past months; pending deletes bypass; approved is superuser-delete only", async () => {
    const q = "?ignore_date_filter=true";
    const past = await employeeA.post("overtime/logs/", { data: log(previousMonthDay(), "e2e locked") });
    expect(past.status(), await past.text()).toBe(201);
    lockedA = (await past.json()).id;
    created.push(lockedA);

    // Updates: locked for the owner in a past month even while pending. A plain admin cannot
    // reach another employee's record through this personal endpoint at all (scoped queryset).
    expect((await employeeA.patch(`overtime/logs/${lockedA}/${q}`, { data: { description: "x" } })).status()).toBe(403);
    expect([403, 404]).toContain(
      (await admin.patch(`overtime/logs/${lockedA}/${q}`, { data: { description: "staff edit" } })).status()
    );

    // Deletes: a pending record can always be removed by its owner (un-approved carry-over cleanup).
    const scratch = await employeeA.post("overtime/logs/", { data: log(previousMonthDay(), "e2e pending delete") });
    expect(scratch.status(), await scratch.text()).toBe(201);
    const scratchDelete = await employeeA.delete(`overtime/logs/${(await scratch.json()).id}/${q}`);
    expect([200, 204], await scratchDelete.text()).toContain(scratchDelete.status());

    // Once approved, deletion is locked for the owner and for plain staff.
    expect((await tlA.post(`overtime/logs/${lockedA}/approve/${q}`)).status()).toBe(200);
    expect((await employeeA.delete(`overtime/logs/${lockedA}/${q}`)).status()).toBe(403);
    expect([403, 404]).toContain((await admin.delete(`overtime/logs/${lockedA}/${q}`)).status());
  });

  test("a superuser can delete the locked record (audit-logged override)", async () => {
    const response = await superuser.delete(`overtime/logs/${lockedA}/?ignore_date_filter=true`);
    expect([200, 204], await response.text()).toContain(response.status());
  });
});

// ------------------------- F: payroll PDFs (reportlab 5) + superuser-only backup

test.describe.serial("F: payroll run, real PDF/Excel downloads, and who may reach them", () => {
  test.describe.configure({ timeout: 180_000 });

  let admin: APIRequestContext;
  let hr: APIRequestContext;
  let employeeA: APIRequestContext;
  let tlA: APIRequestContext;
  let superuser: APIRequestContext;
  let runId = 0;
  let lineId = 0;
  let userIds: number[] = [];

  test.beforeAll(async () => {
    admin = await apiAs(E2E_CREDENTIALS.admin);
    hr = await apiAs(E2E_CREDENTIALS.hr);
    employeeA = await apiAs(E2E_CREDENTIALS.employeeA);
    tlA = await apiAs(E2E_CREDENTIALS.teamLeader);
    superuser = await apiAs({ username: "e2e_super", password: "e2e_pass_2026" });
  });

  test.afterAll(async () => {
    await Promise.all([admin, hr, employeeA, tlA, superuser].map((c) => c?.dispose()));
  });

  test("admin provisions wages and generates a draft run for two employees", async () => {
    const users = results(await (await admin.get("users/users/?search=e2e_employee&page_size=50")).json());
    userIds = users
      .filter((u) => ["e2e_employee_a", "e2e_employee_c"].includes(String(u.username)))
      .map((u) => u.id as number);
    expect(userIds.length).toBe(2);

    for (const user of userIds) {
      const wage = await admin.post("plugins/payroll/wages/", {
        data: { user, gross_monthly_wage: "100000", effective_from: "2026-01-01", is_active: true },
      });
      // A wage from an earlier run may already be active for this fixture user.
      expect([200, 201, 400], await wage.text()).toContain(wage.status());
    }

    // One run per period: use a far-future period that a real run will never occupy.
    let created = null as Awaited<ReturnType<typeof admin.post>> | null;
    for (let attempt = 0; attempt < 25 && !(created?.status() === 201); attempt += 1) {
      created = await admin.post("plugins/payroll/runs/", {
        data: {
          year: 2070 + Math.floor(Math.random() * 30),
          month: 1 + Math.floor(Math.random() * 12),
          user_ids: userIds,
          notes: "e2e role-workflow run",
        },
      });
    }
    expect(created?.status(), await created?.text()).toBe(201);
    runId = (await created!.json()).id;
    expect(runId).toBeGreaterThan(0);

    const lines = results(await (await admin.get(`plugins/payroll/runs/${runId}/lines/`)).json());
    expect(lines.length).toBe(2);
    lineId = lines[0].id as number;

    // Payslips exist only for finalized runs.
    const finalized = await admin.post(`plugins/payroll/runs/${runId}/finalize/`);
    expect(finalized.status(), await finalized.text()).toBe(200);
  });

  test("payslip, run PDF and Excel download as real files", async () => {
    const payslip = await admin.get(`plugins/payroll/runs/${runId}/payslip/?line_id=${lineId}`);
    expect(payslip.status()).toBe(200);
    const payslipBody = await payslip.body();
    expect(payslipBody.subarray(0, 5).toString()).toBe("%PDF-");
    expect(payslipBody.length).toBeGreaterThan(1500);

    const runPdf = await admin.get(`plugins/payroll/runs/${runId}/export_pdf/`);
    expect(runPdf.status()).toBe(200);
    expect((await runPdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

    const excel = await admin.get(`plugins/payroll/runs/${runId}/export_excel/`);
    expect(excel.status()).toBe(200);
    expect((await excel.body()).subarray(0, 2).toString()).toBe("PK"); // xlsx is a zip
  });

  test("HR has payroll parity; employees and plain TLs cannot pull the whole run", async () => {
    expect((await hr.get(`plugins/payroll/runs/${runId}/`)).status()).toBe(200);
    expect((await hr.get(`plugins/payroll/runs/${runId}/export_pdf/`)).status()).toBe(200);

    expect([403, 404]).toContain((await employeeA.get(`plugins/payroll/runs/${runId}/`)).status());
    expect([403, 404]).toContain((await employeeA.get("plugins/payroll/runs/")).status());
    expect([403, 404]).toContain((await tlA.get(`plugins/payroll/runs/${runId}/export_pdf/`)).status());
    expect([403, 404]).toContain((await tlA.get(`plugins/payroll/runs/${runId}/export_excel/`)).status());
  });

  test("site backup is superuser-only: admin is refused, superuser is served", async () => {
    expect((await admin.get("plugins/site_backup/backups/")).status()).toBe(403);
    expect((await hr.get("plugins/site_backup/backups/")).status()).toBe(403);
    expect((await employeeA.get("plugins/site_backup/backups/")).status()).toBe(403);
    expect((await superuser.get("plugins/site_backup/backups/")).status()).toBe(200);
  });
});

// ----------------------------- G: light/dark theme sanity (Tailwind 4) + screenshots

test.describe("G: theme sanity on key pages", () => {
  test.describe.configure({ timeout: 120_000 });

  const PAGES: Array<{ name: string; creds: { username: string; password: string }; route: string }> = [
    { name: "employee-dashboard", creds: E2E_CREDENTIALS.employeeA, route: "/dashboard" },
    { name: "admin-users-table", creds: E2E_CREDENTIALS.admin, route: "/admin/users" },
    { name: "tl-approvals", creds: E2E_CREDENTIALS.teamLeader, route: "/team/approvals" },
  ];

  for (const { name, creds, route } of PAGES) {
    test(`${name}: light and dark both apply, differ, and do not overflow`, async ({ page }, testInfo) => {
      const seen: Record<string, string> = {};
      mkdirSync("e2e-observed/screens", { recursive: true });

      for (const theme of ["light", "dark"] as const) {
        await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
        await loginAsUser(page, creds);
        await page.goto(route);
        await settle(page);

        await expect
          .poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")), {
            message: `${name}: <html> dark class for ${theme} theme`,
          })
          .toBe(theme === "dark");
        const facts = await page.evaluate(() => ({
          background: getComputedStyle(document.body).backgroundColor,
          overflow: document.documentElement.scrollWidth - window.innerWidth,
        }));
        expect(facts.background, `${name} ${theme} body background`).not.toBe("rgba(0, 0, 0, 0)");
        expect(facts.overflow, `${name} ${theme} horizontal overflow (px)`).toBeLessThanOrEqual(1);
        seen[theme] = facts.background;

        await page.screenshot({
          path: `e2e-observed/screens/${name}-${theme}-${testInfo.project.name}.png`,
        });
      }
      expect(seen.light, `${name}: dark theme must change the background`).not.toBe(seen.dark);
    });
  }
});
