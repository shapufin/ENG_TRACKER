import {
  adminWidgetPlacement,
  type StoredDashboardLayout,
} from "@/components/dashboard/widgetRegistry";

export const GRID_LAYOUT_VERSION = 2;
export const GRID_COLUMNS = 12;

/**
 * Every id the dashboard has ever stored, mapped to the widget that shows it now.
 * Merged widgets point at the same target; unchanged ones map to themselves.
 */
export const LEGACY_WIDGET_MAP: Record<string, string> = {
  "total-users": "kpi-strip",
  "total-teams": "kpi-strip",
  "pending-approvals": "kpi-strip",
  "overtime-hours": "kpi-strip",
  "org-headcount": "kpi-strip",
  "leave-utilization": "kpi-strip",
  "carryover-expiry": "kpi-strip",
  "pending-backlog": "approval-queue",
  "approval-status": "approval-queue",
  "approval-aging": "approval-queue",
  "approver-sla": "approval-queue",
  "hours-overview": "hours-trend",
  "ot-standby-trend": "hours-trend",
  "role-distribution": "people-mix",
  "tech-distribution": "people-mix",
  users: "shortcuts",
  teams: "shortcuts",
  clients: "shortcuts",
  permissions: "shortcuts",
  "calendar-mgmt": "shortcuts",
  reports: "shortcuts",
  "holiday-balances": "shortcuts",
  "coverage-gaps": "coverage-gaps",
  "rejection-analysis": "rejection-analysis",
  "ot-by-client": "ot-by-client",
  "team-comparison": "team-comparison",
  "leave-trend": "leave-trend",
  "who-is-out": "who-is-out",
  "period-close": "period-close",
  "backup-status": "backup-status",
  "recent-activity": "recent-activity",
  // Current ids are valid input too, so a half-migrated layout still resolves.
  "kpi-strip": "kpi-strip",
  "approval-queue": "approval-queue",
  "hours-trend": "hours-trend",
  "people-mix": "people-mix",
  shortcuts: "shortcuts",
};

/**
 * Brings a saved admin layout to version 2. A version-2 layout is returned as is.
 * A legacy one keeps exactly the widgets it had (merged ids collapse into one,
 * unknown ids are dropped), each at its default cell; nothing the user had hidden
 * comes back.
 */
export function migrateLayout(saved: StoredDashboardLayout): StoredDashboardLayout {
  if (saved.version === GRID_LAYOUT_VERSION) return saved;
  const seen = new Set<string>();
  const widgets: StoredDashboardLayout["widgets"] = [];
  for (const w of saved.widgets ?? []) {
    const id = LEGACY_WIDGET_MAP[w.id];
    if (!id || seen.has(id)) continue;
    const placement = adminWidgetPlacement(id);
    if (!placement) continue;
    seen.add(id);
    widgets.push(placement);
  }
  return { version: GRID_LAYOUT_VERSION, columns: GRID_COLUMNS, widgets };
}

/** Widget ids in reading order (row, then column). */
export const sortedWidgetIds = (layout: Pick<StoredDashboardLayout, "widgets">): string[] =>
  [...layout.widgets]
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
    .map((w) => w.id);
