import { createContext } from "react";

export type DashboardType = "employee" | "team_leader" | "hr" | "admin";

export interface PermissionContextType {
  isTeamLeader: boolean;
  isItalianTL: boolean;
  isAlbanianTL: boolean;
  isHR: boolean;
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
