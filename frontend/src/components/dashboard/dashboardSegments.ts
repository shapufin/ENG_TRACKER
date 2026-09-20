import type { DashboardType } from "@/context/permission-context-base";

export const WORKSPACE_TAB = "workspace";

/** Short segment labels — the tablist would overflow with full dashboard names. */
export const DASHBOARD_SEGMENT_LABEL: Record<DashboardType, string> = {
  employee: "Personal",
  team_leader: "Team Leader",
  hr: "HR",
  admin: "Admin",
};
