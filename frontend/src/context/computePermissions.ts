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
  const isAlbanianTL =
    hasDatabaseRole(user, "albanian_tl") ?? roleFlag(user, "is_albanian_tl_role");
  const isTeamLeader = anyRole(isItalianTL, isAlbanianTL, roleFlag(user, "is_team_leader"));
  const isHR = hasDatabaseRole(user, "hr") ?? roleFlag(user, "is_hr");
  // HBPR has no legacy flag: the database role is the only source.
  const isHBPR = hasDatabaseRole(user, "hbpr") ?? false;
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
    hasControlRoomAccess && !anyRole(isCRAdmin, isTeamLeader, isHR, isHBPR, isAdmin, isSuperuser);
  return {
    isItalianTL,
    isAlbanianTL,
    isTeamLeader,
    isHR,
    isHBPR,
    isAdmin,
    isSuperuser,
    isCRAdmin,
    isCRUser,
  };
};

/**
 * HBPR and nothing else elevating. Mirrors the backend `is_hbpr_only`: only a
 * TL **role** (or legacy TL flag) elevates, never the derived `is_team_leader`
 * — being named someone's TL must not lift an HBPR-only block, or the frontend
 * would show nav the API then refuses.
 */
const computeIsHBPROnly = (roles: ReturnType<typeof computeRoles>) => {
  const { isHBPR, isItalianTL, isAlbanianTL, isHR, isAdmin, isSuperuser, isCRAdmin } = roles;
  return isHBPR && !isItalianTL && !isAlbanianTL && !isHR && !isAdmin && !isSuperuser && !isCRAdmin;
};

// fallow-ignore-next-line complexity
const computeBasePermissions = (roles: ReturnType<typeof computeRoles>) => {
  const { isTeamLeader, isHR, isHBPR, isAdmin, isSuperuser, isCRAdmin, isCRUser } = roles;
  return {
    isHBPROnly: computeIsHBPROnly(roles),
    // CR admin (scoped admin) and CR user (scoped observer) are NOT regular
    // employees. Excluding both here prevents them from seeing employee nav
    // items (overtime, standby, calendar, leave) in the user shell.
    //   - CR admin's home is /admin/users (admin panel).
    //   - CR user's home is /control-room/dashboard (CR plugin page).
    //   - Multi-role users (CR + TL/HR/admin) keep their higher role's nav
    //     (isCRUser is false when a higher role is present).
    //   - HBPR has no overtime/standby, so it is not an employee-shell user
    //     either (a multi-role HBPR + TL/HR/admin keeps that role's nav).
    isEmployee:
      !isTeamLeader && !isHR && !isHBPR && !isAdmin && !isSuperuser && !isCRAdmin && !isCRUser,
    canApprove: isTeamLeader || isHR || isAdmin,
    canManageTeam: isTeamLeader || isAdmin || isSuperuser,
    canViewTeamData: isTeamLeader || isHR || isAdmin,
    canViewAllData: isAdmin || isSuperuser,
    canViewWorkspaceMembers: isTeamLeader || isHR || isAdmin,
  };
};

const computeDashboards = (roles: ReturnType<typeof computeRoles>) => {
  const { isSuperuser, isAdmin, isHR, isHBPR, isTeamLeader } = roles;
  // The personal dashboard is overtime/standby/leave: an HBPR-only user has no
  // overtime or standby, so it is offered only alongside another role. There is
  // no "hbpr" dashboard — an HBPR's home is the plugin-owned `/hbpr` workspace,
  // reached via the DashboardPage redirect.
  const isHBPROnly = computeIsHBPROnly(roles);
  const availableDashboards: DashboardType[] = [];
  if (isSuperuser || isAdmin) availableDashboards.push("admin");
  if (isHR) availableDashboards.push("hr");
  if (isTeamLeader) availableDashboards.push("team_leader");
  if (!isHBPROnly) availableDashboards.push("employee");

  let primaryDashboard: DashboardType = "employee";
  if (isSuperuser || isAdmin) {
    primaryDashboard = "admin";
  } else if (isHR) {
    primaryDashboard = "hr";
  } else if (isTeamLeader) {
    primaryDashboard = "team_leader";
  } else if (isHBPR) {
    // "hbpr" stays a valid DashboardType as a routing token: an HBPR-only user
    // holds no dashboard, but this value (a) feeds DashboardPage's /hbpr
    // redirect and (b) keeps useDashboardData's `selectedDashboard !== "hbpr"`
    // self-service fetch guard working. Deliberately outside
    // availableDashboards — safe only because they never render /dashboard.
    primaryDashboard = "hbpr";
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
