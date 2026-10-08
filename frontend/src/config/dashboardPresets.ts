import {
  defaultAdminLayout,
  type StoredDashboardLayout,
} from "@/components/dashboard/widgetRegistry";
import { AVAILABLE_WIDGETS } from "@/config/dashboardWidgets";

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
    description: "Approval queue, rejections and period close",
    widgetIds: ["approval-queue", "rejection-analysis", "period-close"],
  },
  {
    id: "workforce",
    label: "Workforce view",
    description: "Key figures, coverage gaps and people mix",
    widgetIds: ["kpi-strip", "coverage-gaps", "people-mix"],
  },
  {
    id: "trends",
    label: "Trends view",
    description: "Hours, leave, clients, teams and who is out",
    widgetIds: ["hours-trend", "leave-trend", "ot-by-client", "team-comparison", "who-is-out"],
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

/**
 * 12-column layout in the stored format: widgets keep the given order and are packed
 * left to right at their default size, wrapping to a new row when the next one won't fit.
 */
export function presetLayout(widgetIds: string[]): StoredDashboardLayout {
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  const widgets = widgetIds.map((id) => {
    const { w, h } = AVAILABLE_WIDGETS.find((c) => c.id === id)?.defaultSize ?? { w: 4, h: 4 };
    if (x + w > 12) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    const placed = { id, position: { x, y }, size: { w, h } };
    x += w;
    rowHeight = Math.max(rowHeight, h);
    return placed;
  });
  return { version: 2, columns: 12, widgets };
}
