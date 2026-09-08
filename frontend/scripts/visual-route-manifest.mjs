// Canonical visual-route manifest — single source of truth for ALL capture/
// prerender/extraction tooling (Phase 1 matrix, generated 2026-09-05).
//
// Pure data + selectors only: no server checks, browser launch, filesystem
// mutation, tokens, or credentials. Safe to import in tests and tooling.
//
// Conventions:
// - `roles` lists VISUAL capture roles. Guard-only access is NOT listed here;
//   see GUARD_ONLY (asserted redirects, never screenshots).
// - `expectedHeading` is string | RegExp matched against the rendered h1.
//   Dynamic-title routes use a RegExp; see DYNAMIC_FIXTURES.
// - `extraction`: app-layout routes carry the per-role slug STEM — tooling
//   composes `<role>-<stem>` to find `app-extract-pages/<role>/<dir>`
//   (exception: role=admin + stem=dashboard -> `admin-user-dashboard`).
//   Admin-layout routes carry the EXACT `app-extract-pages/admin/<dir>`.
//   "NONE" where no extraction exists.
// - `adminExtractionSuspect: true` (every app route with an admin dir):
//   Phase 0 proved cross-role duplicate bytes + role mismatches, so EVERY
//   `admin-*` app-shell extraction is intent-only until its route/heading is
//   re-asserted. tl-*/employee-* compositions are trusted baselines.
// - `mockup`: role-mockup filename or "NONE".
// - Viewports follow the existing evidence set: desktop 1280x800,
//   mobile 375x812 (plan text said 1440x900; 1280x800 kept for consistency
//   with the 251-file baseline — recorded Phase 2 deviation, not an error).
// - Seed fixtures: apps/users/management/commands/seed_e2e_data.py:24-66.
//   CR identities do not exist -> CR routes are NO_FIXTURE (see plan).

export const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 375, height: 812 },
};

export const THEMES = ["dark", "light"];

export const ROLE_FIXTURES = {
  employee: { username: "e2e_employee_a" },
  tl: { username: "e2e_tl" },
  hr: { username: "e2e_hr" },
  tl_hr: { username: "e2e_tl_hr" },
  admin: { username: "e2e_admin" },
  cr_user: null, // NO FIXTURE — no deterministic CR identity in seed_e2e_data
  cr_admin: null, // NO FIXTURE — verified absent; stop CR gate, request fixture
};

export const DYNAMIC_FIXTURES = ["resource-group", "payroll-run", "org-chart"];

// layout: "app" (AppShell, CRUserGuard-wrapped except /settings) | "admin"
// (AdminShell behind SuperuserRoute: superuser/admin/HR in, CR-only admin
// redirected to /control-room/dashboard, everyone else to /dashboard).
export const ROUTES = [
  // ---- App shell core (CRUserGuard-wrapped) ----
  {
    path: "/dashboard",
    label: "dashboard",
    layout: "app",
    roles: ["employee", "tl", "hr", "tl_hr", "admin"],
    expectedHeading: /Dashboard/,
    mockup: "dashboard.html",
    extraction: "dashboard",
    adminExtractionSuspect: true,
  },
  {
    path: "/overtime",
    label: "overtime",
    layout: "app",
    roles: ["employee", "tl", "hr", "tl_hr", "admin"],
    expectedHeading: "Overtime",
    mockup: "overtime.html",
    extraction: "overtime",
    adminExtractionSuspect: true,
  },
  {
    path: "/standby",
    label: "standby",
    layout: "app",
    roles: ["employee", "tl", "hr", "tl_hr", "admin"],
    expectedHeading: "Standby",
    mockup: "standby.html",
    extraction: "standby",
    adminExtractionSuspect: true,
  },
  {
    path: "/leave-management",
    label: "leave",
    layout: "app",
    roles: ["employee", "tl", "hr", "tl_hr", "admin"],
    expectedHeading: "Leave Management",
    mockup: "leave.html",
    extraction: "leave",
    adminExtractionSuspect: true,
  },
  {
    path: "/calendar",
    label: "calendar",
    layout: "app",
    roles: ["employee", "tl", "hr", "tl_hr", "admin"],
    expectedHeading:
      /Schedule List|Filters|Members|(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}|Select a workspace/,
    mockup: "calendar.html",
    extraction: "calendar",
    adminExtractionSuspect: true,
    note: "month-view h1 is the dynamic month-year nav title; workspace-less admin sees the EmptyState prompt (h3) instead of calendar chrome — both accepted",
  },
  {
    path: "/team",
    label: "team-overview",
    layout: "app",
    roles: ["employee", "tl", "hr", "tl_hr", "admin"],
    expectedHeading: "Team Overview",
    mockup: "team-overview.html",
    extraction: "team-overview",
    adminExtractionSuspect: true,
    expectedDenial: ["employee", "hr"],
    note: "employee/hr render the Access Denied variant (same h1; canManageTeam=false) — valid denial coverage, not a redirect; their team-scope data 403s are the expected denial mechanism",
  },
  {
    path: "/team/approvals",
    label: "pending-approvals",
    layout: "app",
    roles: ["tl", "tl_hr", "admin"],
    expectedHeading: "Pending Approvals",
    mockup: "pending-approvals.html",
    extraction: "pending-approvals",
    adminExtractionSuspect: true,
  },
  {
    path: "/hr/reports",
    label: "hr-reports",
    layout: "app",
    roles: ["hr", "tl_hr", "admin"],
    expectedHeading: "HR Intelligence & Reports",
    mockup: "hr-reports.html",
    extraction: "hr-reports",
    adminExtractionSuspect: true,
  },
  {
    path: "/settings",
    label: "settings",
    layout: "app",
    roles: ["employee", "tl", "hr", "tl_hr", "admin"],
    expectedHeading: "Settings",
    mockup: "settings.html",
    extraction: "settings",
    adminExtractionSuspect: true,
  },
  // ---- App shell plugin routes ----
  {
    path: "/analytics",
    label: "analytics",
    layout: "app",
    roles: ["admin"],
    expectedHeading: "Analytics Dashboard",
    mockup: "NONE",
    extraction: "NONE",
    note: "only the staff-superuser active set registers it (live gates 2026-09-05: employee/tl/tl_hr/hr all redirect). Admin positive proven by valid captures",
  },
  {
    path: "/notifications",
    label: "notifications",
    layout: "app",
    roles: ["employee", "tl", "hr", "tl_hr", "admin"],
    expectedHeading: "Notifications",
    mockup: "NONE",
    extraction: "notifications",
    adminExtractionSuspect: true,
    note: "only the admin-* dir exists; tl/employee/hr rows have no extraction",
  },
  {
    path: "/control-room/dashboard",
    label: "control-room-dashboard",
    layout: "app",
    roles: ["admin"],
    expectedHeading: "Control Room",
    mockup: "admin-control-room-access.html",
    extraction: "NONE",
    note: "CR roles NO_FIXTURE; admin validated Phase 7 (needs CR access grant)",
  },
  {
    path: "/control-room/access",
    label: "control-room-access",
    layout: "app",
    roles: ["admin"],
    expectedHeading: "Access management",
    mockup: "NONE",
    extraction: "control-room-access",
    adminExtractionSuspect: true,
    note: "only the admin-* dir exists; admin-only CRUD, validated Phase 7",
  },
  {
    path: "/organigrama",
    label: "organigrama",
    layout: "app",
    roles: ["employee", "tl", "hr", "tl_hr", "admin"],
    expectedHeading: /Organigrama/,
    mockup: "organigrama.html",
    extraction: "organigrama",
    adminExtractionSuspect: true,
  },
  {
    path: "/skills",
    label: "my-skills",
    layout: "app",
    roles: ["employee", "tl", "hr", "tl_hr", "admin"],
    expectedHeading: "My Skills",
    mockup: "my-skills.html",
    extraction: "my-skills",
    adminExtractionSuspect: true,
  },
  {
    path: "/skills/team",
    label: "skills-team",
    layout: "app",
    roles: ["tl", "tl_hr", "admin"],
    expectedHeading: "Team Skills & Capability Engine",
    mockup: "skills-matrix.html",
    extraction: "skills-team",
    adminExtractionSuspect: true,
  },
  {
    path: "/skills/history",
    label: "skills-history",
    layout: "app",
    roles: ["employee", "tl", "hr", "tl_hr", "admin"],
    expectedHeading: "Skill History",
    mockup: "skills-history.html",
    extraction: "skills-history",
    adminExtractionSuspect: true,
  },
  {
    path: "/ticket-kpi/upload",
    label: "ticket-kpi-upload",
    layout: "app",
    roles: ["tl", "tl_hr", "admin"],
    expectedHeading: "Ticket Upload",
    mockup: "upload-management.html",
    extraction: "NONE",
  },
  {
    path: "/ticket-kpi/dashboard",
    label: "ticket-kpi",
    layout: "app",
    roles: ["employee", "tl", "hr", "tl_hr", "admin"],
    expectedHeading: /Ticket (KPI|Dashboard)/,
    mockup: "ticket-kpi.html",
    extraction: "ticket-kpi",
    adminExtractionSuspect: true,
  },
  {
    path: "/ticket-kpi/team",
    label: "team-performance",
    layout: "app",
    roles: ["tl", "tl_hr", "admin"],
    expectedHeading: "Team KPI",
    mockup: "team-performance.html",
    extraction: "team-performance",
    adminExtractionSuspect: true,
  },
  {
    path: "/ticket-kpi/team-management",
    label: "upload-management",
    layout: "app",
    roles: ["tl", "tl_hr", "admin"],
    expectedHeading: "KPI Team Management",
    mockup: "upload-management.html",
    extraction: "upload-management",
    adminExtractionSuspect: true,
  },
  // ---- Admin shell core (SuperuserRoute) ----
  {
    path: "/admin",
    label: "admin-dashboard",
    layout: "admin",
    roles: ["admin", "hr"],
    expectedHeading: "Admin Dashboard",
    mockup: "admin-dashboard.html",
    extraction: "admin-dashboard",
  },
  {
    path: "/admin/users",
    label: "admin-users",
    layout: "admin",
    roles: ["admin", "hr"],
    expectedHeading: "Users",
    mockup: "NONE",
    extraction: "admin-users",
  },
  {
    path: "/admin/teams",
    label: "admin-teams",
    layout: "admin",
    roles: ["admin", "hr"],
    expectedHeading: "Teams",
    mockup: "NONE",
    extraction: "admin-teams",
  },
  {
    path: "/admin/techs",
    label: "admin-techs",
    layout: "admin",
    roles: ["admin", "hr"],
    expectedHeading: "Tech",
    mockup: "NONE",
    extraction: "admin-techs",
  },
  {
    path: "/admin/clients",
    label: "admin-clients",
    layout: "admin",
    roles: ["admin", "hr"],
    expectedHeading: "Clients",
    mockup: "admin-clients.html",
    extraction: "admin-clients",
  },
  {
    path: "/admin/resource-access",
    label: "admin-resource-access",
    layout: "admin",
    roles: ["admin", "hr"],
    expectedHeading: "Resource access",
    mockup: "NONE",
    extraction: "admin-resource-access",
  },
  {
    path: "/admin/resource-access/groups/:groupId",
    label: "admin-resource-access-group",
    layout: "admin",
    roles: ["admin", "hr"],
    expectedHeading: /[\s\S]+/,
    mockup: "NONE",
    extraction: "NONE",
    dynamicFixture: "resource-group",
    note: "h1 is the dynamic group name; assert non-empty h1 + resolved fixture",
  },
  {
    path: "/admin/reports",
    label: "admin-reports",
    layout: "admin",
    roles: ["admin", "hr"],
    expectedHeading: "Intelligence & Reports",
    mockup: "NONE",
    extraction: "admin-reports",
  },
  {
    path: "/admin/calendars",
    label: "admin-calendars",
    layout: "admin",
    roles: ["admin", "hr"],
    expectedHeading: "Team Calendar Groups",
    mockup: "admin-calendar.html",
    extraction: "admin-calendars",
  },
  {
    path: "/admin/leave-balances",
    label: "admin-leave-balances",
    layout: "admin",
    roles: ["admin"],
    expectedHeading: "Leave Balances",
    mockup: "admin-leave-balances.html",
    extraction: "admin-leave-balances",
    note: "component-level isAdmin gate (LeaveBalancesPage:116-117); hr redirects to /leave-management by design",
  },
  {
    path: "/admin/global-settings",
    label: "admin-global-settings",
    layout: "admin",
    roles: ["admin", "hr"],
    expectedHeading: "Global Vacation Settings",
    mockup: "admin-global-settings.html",
    extraction: "admin-global-settings",
  },
  {
    path: "/admin/overtime-logs",
    label: "admin-overtime-logs",
    layout: "admin",
    roles: ["admin", "hr"],
    expectedHeading: "Overtime Logs",
    mockup: "admin-overtime-logs.html",
    extraction: "admin-overtime-logs",
  },
  {
    path: "/admin/standby-logs",
    label: "admin-standby-logs",
    layout: "admin",
    roles: ["admin", "hr"],
    expectedHeading: "Standby Logs",
    mockup: "NONE",
    extraction: "admin-standby-logs",
  },
  {
    path: "/admin/leave-requests",
    label: "admin-leave-requests",
    layout: "admin",
    roles: ["admin"],
    expectedHeading: "Leave Requests",
    mockup: "NONE",
    extraction: "admin-leave-requests",
    note: "component-level isAdmin gate (LeaveRequestsPage:159-162); hr redirects to /leave-management by design",
  },
  {
    path: "/admin/plugins",
    label: "admin-plugins",
    layout: "admin",
    roles: ["admin", "hr"],
    expectedHeading: "Plugin Management",
    mockup: "NONE",
    extraction: "admin-plugins",
  },
  // ---- Admin shell plugin routes ----
  {
    path: "/admin/analytics",
    label: "admin-analytics",
    layout: "admin",
    roles: ["admin"],
    expectedHeading: "Analytics Dashboard",
    mockup: "NONE",
    extraction: "admin-analytics",
    note: "hr unregistered (per-user active set; proven live 2026-09-05)",
  },
  {
    path: "/admin/audit-logs",
    label: "admin-audit-logs",
    layout: "admin",
    roles: ["admin"],
    expectedHeading: "Audit Logs",
    mockup: "NONE",
    extraction: "admin-audit-logs",
    note: "hr unregistered (per-user active set; proven live 2026-09-05)",
  },
  {
    path: "/admin/control-room/access",
    label: "admin-control-room-access",
    layout: "admin",
    roles: ["admin"],
    expectedHeading: "Access management",
    mockup: "admin-control-room-access.html",
    extraction: "admin-control-room-access",
    note: "hr unregistered (per-user active set; proven live 2026-09-05)",
  },
  {
    path: "/admin/data-import",
    label: "admin-data-import",
    layout: "admin",
    roles: ["admin", "hr"],
    expectedHeading: "Data Import",
    mockup: "NONE",
    extraction: "admin-data-import",
    note: "ENV-BLOCKED 2026-09-05: data_import plugin is_enabled=False in dev → unregistered route for ALL roles; enable via /admin/plugins to cover",
  },
  {
    path: "/admin/organigrama",
    label: "admin-organigrama",
    layout: "admin",
    roles: ["admin", "hr"],
    expectedHeading: "Organigrama Admin",
    mockup: "NONE",
    extraction: "admin-organigrama",
  },
  {
    path: "/admin/organigrama/:chartId/builder",
    label: "admin-organigrama-builder",
    layout: "admin",
    roles: ["admin", "hr"],
    expectedHeading: /[\s\S]+/,
    mockup: "NONE",
    extraction: "NONE",
    dynamicFixture: "org-chart",
    note: "loaded-state h1 is the dynamic chart name (PageShell title={chart?.name}); fixture chart 2 named 'test' verified live 2026-09-05 — assert non-empty h1 + resolved fixture",
  },
  {
    path: "/admin/organigrama/:chartId/publish",
    label: "admin-organigrama-publish",
    layout: "admin",
    roles: ["admin", "hr"],
    expectedHeading: "Publish & Audience",
    mockup: "NONE",
    extraction: "NONE",
    dynamicFixture: "org-chart",
  },
  {
    path: "/admin/payroll/wages",
    label: "admin-payroll-wages",
    layout: "admin",
    roles: ["admin"],
    expectedHeading: "Wage Assignments",
    mockup: "admin-payroll-wages.html",
    extraction: "admin-payroll-wages",
    note: "hr unregistered (per-user active set; proven live 2026-09-05)",
  },
  {
    path: "/admin/payroll/runs",
    label: "admin-payroll-runs",
    layout: "admin",
    roles: ["admin"],
    expectedHeading: "Payroll Runs",
    mockup: "admin-payroll-runs.html",
    extraction: "admin-payroll-runs",
    note: "hr unregistered (per-user active set; proven live 2026-09-05)",
  },
  {
    path: "/admin/payroll/runs/:id",
    label: "admin-payroll-run-detail",
    layout: "admin",
    roles: ["admin"],
    expectedHeading: /^Payroll Run \d{4}-\d{2}/,
    mockup: "NONE",
    extraction: "NONE",
    dynamicFixture: "payroll-run",
    note: "hr unregistered (per-user active set; proven live 2026-09-05)",
  },
  {
    path: "/admin/payroll/calendar",
    label: "admin-payroll-calendar",
    layout: "admin",
    roles: ["admin"],
    expectedHeading: "Work Calendar",
    mockup: "admin-payroll-calendar.html",
    extraction: "admin-payroll-calendar",
    note: "hr unregistered (per-user active set; proven live 2026-09-05)",
  },
  {
    path: "/admin/payroll/settings",
    label: "admin-payroll-settings",
    layout: "admin",
    roles: ["admin"],
    expectedHeading: "Payroll Settings",
    mockup: "admin-payroll-settings.html",
    extraction: "admin-payroll-settings",
    note: "hr unregistered (per-user active set; proven live 2026-09-05)",
  },
  {
    path: "/admin/skills/catalog",
    label: "admin-skills-catalog",
    layout: "admin",
    roles: ["admin", "hr"],
    expectedHeading: "Skills Catalog",
    mockup: "NONE",
    extraction: "admin-skills-catalog",
  },
  {
    path: "/admin/ticket-kpi/mappings",
    label: "admin-ticket-kpi-mappings",
    layout: "admin",
    roles: ["admin", "hr"],
    expectedHeading: "Ticket KPI Admin",
    mockup: "NONE",
    extraction: "admin-ticket-kpi-mappings",
  },
  // ---- Public ----
  {
    path: "/login",
    label: "login",
    layout: "app",
    roles: ["employee", "admin"],
    expectedHeading: "Time Tracker",
    mockup: "NONE",
    extraction: "NONE",
    note: "public route; employee+admin rows stand in for both themes",
  },
];

// Redirect-only aliases: route-contract tests, never screenshot targets.
export const REDIRECTS = [
  { path: "/", note: "HomeRedirect (role-dependent landing)" },
  { path: "/admin-dashboard/*", to: "/admin" },
];

// Guard-only access: asserted redirects (Playwright), never visual captures.
// NOTE: /team is NOT guard-redirected (AppRoutes: direct CRUserGuard child;
// TeamManagementPage renders Access Denied in place) — only /team/approvals
// sits behind TLRoute.
export const GUARD_ONLY = [
  {
    path: "/team/approvals",
    roles: ["employee", "hr"],
    expectRedirect: "/dashboard",
    via: "TLRoute",
  },
  { path: "/hr/reports", roles: ["employee", "tl"], expectRedirect: "/dashboard", via: "HRRoute" },
  {
    path: "/analytics",
    roles: ["employee", "tl", "tl_hr", "hr"],
    expectRedirect: "/dashboard",
    via: "unregistered plugin route -> HomeRedirect (proven live 2026-09-05)",
  },
  {
    path: "/admin/analytics",
    roles: ["hr"],
    expectRedirect: "/dashboard",
    via: "unregistered plugin route -> HomeRedirect (proven live 2026-09-05)",
  },
  {
    path: "/admin/audit-logs",
    roles: ["hr"],
    expectRedirect: "/dashboard",
    via: "unregistered plugin route -> HomeRedirect (proven live 2026-09-05)",
  },
  {
    path: "/admin/control-room/access",
    roles: ["hr"],
    expectRedirect: "/dashboard",
    via: "unregistered plugin route -> HomeRedirect (proven live 2026-09-05)",
  },
  {
    path: "/admin/payroll/wages",
    roles: ["hr"],
    expectRedirect: "/dashboard",
    via: "unregistered plugin route -> HomeRedirect (proven live 2026-09-05)",
  },
  {
    path: "/admin/payroll/runs",
    roles: ["hr"],
    expectRedirect: "/dashboard",
    via: "unregistered plugin route -> HomeRedirect (proven live 2026-09-05)",
  },
  {
    path: "/admin/payroll/calendar",
    roles: ["hr"],
    expectRedirect: "/dashboard",
    via: "unregistered plugin route -> HomeRedirect (proven live 2026-09-05)",
  },
  {
    path: "/admin/payroll/settings",
    roles: ["hr"],
    expectRedirect: "/dashboard",
    via: "unregistered plugin route -> HomeRedirect (proven live 2026-09-05)",
  },
  {
    path: "/admin/payroll/runs/:id",
    roles: ["hr"],
    expectRedirect: "/dashboard",
    via: "unregistered plugin route -> HomeRedirect (proven live 2026-09-05)",
  },
  {
    path: "/admin/data-import",
    roles: ["admin", "hr"],
    expectRedirect: "/dashboard",
    via: "ENV-BLOCKED: data_import plugin is_enabled=False in dev -> unregistered route (proven live 2026-09-05)",
  },
  {
    path: "/admin/leave-requests",
    roles: ["hr"],
    expectRedirect: "/leave-management",
    via: "component-level isAdmin gate (LeaveRequestsPage; proven live 2026-09-05)",
  },
  {
    path: "/admin/leave-balances",
    roles: ["hr"],
    expectRedirect: "/leave-management",
    via: "component-level isAdmin gate (LeaveBalancesPage:116-117; proven live 2026-09-05)",
  },
  {
    path: "/admin/*",
    roles: ["employee", "tl"],
    expectRedirect: "/dashboard",
    via: "SuperuserRoute",
  },
  {
    path: "/admin/*",
    roles: ["cr_admin"],
    expectRedirect: "/control-room/dashboard",
    via: "SuperuserRoute outer guard",
  },
];

// Resolve an extraction dirname for a route+role, or null when absent.
// App-layout: `<role>-<stem>` (admin+dashboard -> `admin-user-dashboard`).
// Admin-layout: exact `admin/<extraction>`.
export function extractionDirFor(route, role) {
  if (route.extraction === "NONE") return null;
  if (route.layout === "admin") return `admin/${route.extraction}`;
  if (role === "admin" && route.extraction === "dashboard") return "admin/admin-user-dashboard";
  return `${role}/${role}-${route.extraction}`;
}

// ---- Selectors (pure; used by tooling + tests) ----
export function routesForRole(role) {
  return ROUTES.filter((r) => r.roles.includes(role));
}

export function visualRoles(path) {
  return (ROUTES.find((r) => r.path === path) || { roles: [] }).roles;
}

export function isDynamic(route) {
  return route.path.includes(":");
}

// Full visual matrix: every route x role x theme x viewport.
export function matrix() {
  const rows = [];
  for (const route of ROUTES) {
    for (const role of route.roles) {
      for (const theme of THEMES) {
        for (const viewport of Object.keys(VIEWPORTS)) {
          rows.push({
            path: route.path,
            label: route.label,
            layout: route.layout,
            role,
            theme,
            viewport,
          });
        }
      }
    }
  }
  return rows;
}
