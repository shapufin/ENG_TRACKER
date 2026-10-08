import { defaultAdminLayout } from "@/components/dashboard/widgetRegistry";

export interface DashboardPreset {
  id: string;
  label: string;
  description: string;
  widgetIds: string[];
}

/**
 * Named widget sets for the admin dashboard. A preset only ever lists ids; whether a
 * widget is actually shown stays gated by superuser-only / plugin / permission checks
 * where the widget renders, so a preset can never widen access.
 */
export const DASHBOARD_PRESETS: DashboardPreset[] = [
  {
    id: "approver",
    label: "Approver view",
    description: "Pending queue, aging, approver speed and rejections",
    widgetIds: [
      "pending-approvals",
      "pending-backlog",
      "approval-aging",
      "approver-sla",
      "rejection-analysis",
      "period-close",
      "approval-status",
    ],
  },
  {
    id: "workforce",
    label: "Workforce view",
    description: "Headcount, coverage gaps, roles and tech",
    widgetIds: [
      "total-users",
      "total-teams",
      "org-headcount",
      "coverage-gaps",
      "role-distribution",
      "tech-distribution",
    ],
  },
  {
    id: "trends",
    label: "Trends view",
    description: "Hours, leave, clients, teams and who is out",
    widgetIds: [
      "overtime-hours",
      "hours-overview",
      "ot-standby-trend",
      "leave-trend",
      "ot-by-client",
      "team-comparison",
      "who-is-out",
    ],
  },
  {
    id: "default",
    label: "Default layout",
    description: "The standard admin dashboard",
    widgetIds: defaultAdminLayout.widgets.map((w) => w.id),
  },
];

/** Preset order kept; unknown ids dropped; superuser-only ids dropped unless superuser. */
export function resolvePresetWidgets(
  preset: DashboardPreset,
  available: { id: string; superuserOnly?: boolean }[],
  isSuperuser: boolean
): string[] {
  const byId = new Map(available.map((w) => [w.id, w]));
  return preset.widgetIds.filter((id) => {
    const w = byId.get(id);
    return !!w && (!w.superuserOnly || isSuperuser);
  });
}

/** Four-column grid layout in the stored format, one cell per widget in order. */
export function presetLayout(widgetIds: string[]) {
  return {
    columns: 4,
    widgets: widgetIds.map((id, i) => ({
      id,
      position: { x: i % 4, y: Math.floor(i / 4) },
      size: { w: 1, h: 1 },
    })),
  };
}
