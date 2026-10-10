// Admin route list for the visual-lift capture harness. Mirrors
// admin-gui-screenshots/INDEX.md (27 pages); tabs from pages/<n>-<slug>.md.
// Tab names with live counts ("Active (1)") are stored without the count.
// Dashboard "Roles" is omitted: it is not a clickable role=tab (the original 2026-10-10 capture could not open it either).
export const ADMIN_ROUTES = [
  { n: "01", slug: "dashboard", path: "/admin", tabs: ["All", "Overview", "Approvals", "Hours & Trends", "Leave", "System", "Shortcuts"] },
  { n: "02", slug: "users", path: "/admin/users" },
  { n: "03", slug: "teams", path: "/admin/teams" },
  { n: "04", slug: "techs", path: "/admin/techs" },
  { n: "05", slug: "clients", path: "/admin/clients" },
  { n: "06", slug: "hbpr-assignments", path: "/admin/hbpr-assignments", tabs: ["Active", "Archive"] },
  { n: "07", slug: "skills-catalog", path: "/admin/skills/catalog" },
  { n: "08", slug: "skills-settings", path: "/admin/skills/settings" },
  { n: "09", slug: "calendars", path: "/admin/calendars", tabs: ["Team Calendar Groups", "Calendar Workspaces", "Holidays"] },
  { n: "10", slug: "overtime-logs", path: "/admin/overtime-logs" },
  { n: "11", slug: "standby-logs", path: "/admin/standby-logs" },
  { n: "12", slug: "leave-requests", path: "/admin/leave-requests" },
  { n: "13", slug: "leave-balances", path: "/admin/leave-balances" },
  { n: "14", slug: "resource-access", path: "/admin/resource-access" },
  { n: "15", slug: "reports", path: "/admin/reports", tabs: ["OT & Standby", "Vacations"] },
  { n: "16", slug: "plugins", path: "/admin/plugins" },
  { n: "17", slug: "ticket-kpi-mappings", path: "/admin/ticket-kpi/mappings", tabs: ["Profiles", "Test Mapping", "Reports"] },
  { n: "18", slug: "data-import", path: "/admin/data-import", tabs: ["Import", "History"] },
  { n: "19", slug: "payroll-wages", path: "/admin/payroll/wages" },
  { n: "20", slug: "payroll-runs", path: "/admin/payroll/runs" },
  { n: "21", slug: "payroll-calendar", path: "/admin/payroll/calendar" },
  { n: "22", slug: "payroll-settings", path: "/admin/payroll/settings" },
  { n: "23", slug: "analytics", path: "/admin/analytics" },
  { n: "24", slug: "control-room-access", path: "/admin/control-room/access" },
  { n: "25", slug: "global-settings", path: "/admin/global-settings" },
  { n: "26", slug: "audit-logs", path: "/admin/audit-logs" },
  { n: "27", slug: "backup-restore", path: "/admin/backup-restore", tabs: ["Backups", "Restore"] },
];
