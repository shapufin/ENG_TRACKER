import type { PermissionContextType, DashboardType } from "./permission-context-base";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const roleFlag = (user: any, key: string): boolean => Boolean(user?.[key]);

const anyRole = (...roles: boolean[]): boolean => roles.some(Boolean);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hasDatabaseRole = (user: any, code: string): boolean | undefined => {
  if (!Array.isArray(user?.roles)) return undefined;
  // An empty roles array means the backend sent the field but the user has
  // no database role assignments. Fall through to legacy flags so users
  // who were assigned roles via the old flag-only path are not locked out.
  if (user.roles.length === 0) return undefined;
  return user.roles.includes(code);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const computeRoles = (user: any) => {
  const isItalianTL = hasDatabaseRole(user, "italian_tl") ?? roleFlag(user, "is_italian_tl_role");
  const isAlbanianTL = hasDatabaseRole(user, "albanian_tl") ?? roleFlag(user, "is_albanian_tl_role");
  const isTeamLeader = anyRole(isItalianTL, isAlbanianTL, roleFlag(user, "is_team_leader"));
  const isHR = hasDatabaseRole(user, "hr") ?? roleFlag(user, "is_hr");
  const isAdmin = roleFlag(user, "is_staff");
  const isSuperuser = roleFlag(user, "is_superuser");
  const isCRAdmin = hasDatabaseRole(user, "cr_admin") ?? roleFlag(user, "is_cr_admin");
  const hasControlRoomAccess = roleFlag(user, "has_control_room_access");
  // CR user = non-admin employee with active ControlRoomAccess. Their home
  // is /control-room/dashboard (the CR plugin page); they should NOT see
  // standard employee nav (overtime/standby/leave/calendar). A CR admin is
  // NOT a CR user — their home is /admin/users. A user who is BOTH a CR
  // user and a TL/HR/admin is treated as the higher role (isCRUser=false).
  const isCRUser =
    hasControlRoomAccess && !anyRole(isCRAdmin, isTeamLeader, isHR, isAdmin, isSuperuser);
  return {
    isItalianTL,
    isAlbanianTL,
    isTeamLeader,
    isHR,
    isAdmin,
    isSuperuser,
    isCRAdmin,
    isCRUser,
  };
};

// fallow-ignore-next-line complexity
const computeBasePermissions = (roles: ReturnType<typeof computeRoles>) => {
  const { isTeamLeader, isHR, isAdmin, isSuperuser, isCRAdmin, isCRUser } = roles;
  return {
    // CR admin (scoped admin) and CR user (scoped observer) are NOT regular
    // employees. Excluding both here prevents them from seeing employee nav
    // items (overtime, standby, calendar, leave) in the user shell.
    //   - CR admin's home is /admin/users (admin panel).
    //   - CR user's home is /control-room/dashboard (CR plugin page).
    //   - Multi-role users (CR + TL/HR/admin) keep their higher role's nav
    //     (isCRUser is false when a higher role is present).
    isEmployee: !isTeamLeader && !isHR && !isAdmin && !isSuperuser && !isCRAdmin && !isCRUser,
    canApprove: isTeamLeader || isHR || isAdmin,
    canManageTeam: isTeamLeader || isAdmin || isSuperuser,
    canViewTeamData: isTeamLeader || isHR || isAdmin,
    canViewAllData: isAdmin || isSuperuser,
    canViewWorkspaceMembers: isTeamLeader || isHR || isAdmin,
  };
};

const computeDashboards = (roles: ReturnType<typeof computeRoles>) => {
  const { isSuperuser, isAdmin, isHR, isTeamLeader } = roles;
  const availableDashboards: DashboardType[] = [];
  if (isSuperuser || isAdmin) availableDashboards.push("admin");
  if (isHR) availableDashboards.push("hr");
  if (isTeamLeader) availableDashboards.push("team_leader");
  availableDashboards.push("employee");

  let primaryDashboard: DashboardType = "employee";
  if (isSuperuser || isAdmin) {
    primaryDashboard = "admin";
  } else if (isHR) {
    primaryDashboard = "hr";
  } else if (isTeamLeader) {
    primaryDashboard = "team_leader";
  }

  return { availableDashboards, primaryDashboard };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function computePermissions(user: any): PermissionContextType {
  const roles = computeRoles(user);
  const permissions = computeBasePermissions(roles);
  const dashboards = computeDashboards(roles);
  return { ...roles, ...permissions, ...dashboards };
}
