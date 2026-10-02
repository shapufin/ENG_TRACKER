import { createContext } from "react";

export type DashboardType = "employee" | "team_leader" | "hr" | "hbpr" | "admin";

export interface PermissionContextType {
  isTeamLeader: boolean;
  isItalianTL: boolean;
  isAlbanianTL: boolean;
  isHR: boolean;
  isHBPR: boolean;
  /** HBPR and no other elevating role. Mirrors the backend `is_hbpr_only`. */
  isHBPROnly: boolean;
  isAdmin: boolean;
  isSuperuser: boolean;
  isCRAdmin: boolean;
  isCRUser: boolean;
  isEmployee: boolean;
  canApprove: boolean;
  canManageTeam: boolean;
  canViewTeamData: boolean;
  canViewAllData: boolean;
  canViewWorkspaceMembers: boolean;
  availableDashboards: DashboardType[];
  primaryDashboard: DashboardType;
}

export const PermissionContext = createContext<PermissionContextType | undefined>(undefined);
