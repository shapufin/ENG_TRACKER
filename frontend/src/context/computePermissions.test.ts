import { describe, it, expect } from "vitest";
import { computePermissions } from "./computePermissions";

describe("computePermissions", () => {
  it("returns employee defaults for null/undefined user", () => {
    const result = computePermissions(null);
    expect(result).toEqual({
      isItalianTL: false,
      isAlbanianTL: false,
      isTeamLeader: false,
      isHR: false,
      isAdmin: false,
      isSuperuser: false,
      isCRAdmin: false,
      isCRUser: false,
      isEmployee: true,
      canApprove: false,
      canManageTeam: false,
      canViewTeamData: false,
      canViewAllData: false,
      canViewWorkspaceMembers: false,
      availableDashboards: ["employee"],
      primaryDashboard: "employee",
    });
  });

  it("identifies a superuser and grants admin-level access", () => {
    const result = computePermissions({ is_superuser: true });
    expect(result.isSuperuser).toBe(true);
    expect(result.isAdmin).toBe(false);
    expect(result.isEmployee).toBe(false);
    expect(result.canApprove).toBe(false);
    expect(result.canManageTeam).toBe(true);
    expect(result.canViewAllData).toBe(true);
    expect(result.availableDashboards).toContain("admin");
    expect(result.primaryDashboard).toBe("admin");
  });

  it("identifies an admin user", () => {
    const result = computePermissions({ is_staff: true });
    expect(result.isAdmin).toBe(true);
    expect(result.isSuperuser).toBe(false);
    expect(result.canViewAllData).toBe(true);
    expect(result.primaryDashboard).toBe("admin");
  });

  it("identifies an HR user", () => {
    const result = computePermissions({ is_hr: true });
    expect(result.isHR).toBe(true);
    expect(result.canApprove).toBe(true);
    expect(result.canViewTeamData).toBe(true);
    expect(result.availableDashboards).toContain("hr");
    expect(result.primaryDashboard).toBe("hr");
  });

  it("identifies an Italian team leader", () => {
    const result = computePermissions({ is_italian_tl_role: true });
    expect(result.isItalianTL).toBe(true);
    expect(result.isTeamLeader).toBe(true);
    expect(result.canApprove).toBe(true);
    expect(result.canViewTeamData).toBe(true);
    expect(result.availableDashboards).toContain("team_leader");
    expect(result.primaryDashboard).toBe("team_leader");
  });

  it("identifies an Albanian team leader", () => {
    const result = computePermissions({ is_albanian_tl_role: true });
    expect(result.isAlbanianTL).toBe(true);
    expect(result.isTeamLeader).toBe(true);
    expect(result.canManageTeam).toBe(true);
    expect(result.primaryDashboard).toBe("team_leader");
  });

  it("identifies a legacy team leader flag", () => {
    const result = computePermissions({ is_team_leader: true });
    expect(result.isTeamLeader).toBe(true);
    expect(result.isItalianTL).toBe(false);
    expect(result.isAlbanianTL).toBe(false);
  });

  it("combines multiple roles correctly", () => {
    const result = computePermissions({
      is_superuser: true,
      is_hr: true,
      is_italian_tl_role: true,
    });
    expect(result.isSuperuser).toBe(true);
    expect(result.isHR).toBe(true);
    expect(result.isItalianTL).toBe(true);
    expect(result.isTeamLeader).toBe(true);
    expect(result.availableDashboards).toEqual(["admin", "hr", "team_leader", "employee"]);
    expect(result.primaryDashboard).toBe("admin");
  });

  it("marks a non-privileged user as employee", () => {
    const result = computePermissions({ id: 42, username: "john" });
    expect(result.isEmployee).toBe(true);
    expect(result.canApprove).toBe(false);
    expect(result.canViewAllData).toBe(false);
    expect(result.availableDashboards).toEqual(["employee"]);
  });

  it("treats both TL flags as team leader without duplicate logic", () => {
    const result = computePermissions({ is_italian_tl_role: true, is_albanian_tl_role: true });
    expect(result.isItalianTL).toBe(true);
    expect(result.isAlbanianTL).toBe(true);
    expect(result.isTeamLeader).toBe(true);
    expect(result.canManageTeam).toBe(true);
  });

  it("gives a staff user team management but not superuser rights", () => {
    const result = computePermissions({ is_staff: true });
    expect(result.isAdmin).toBe(true);
    expect(result.isSuperuser).toBe(false);
    expect(result.canManageTeam).toBe(true);
    expect(result.canViewTeamData).toBe(true);
  });

  it("grants an HR user workspace member visibility", () => {
    const result = computePermissions({ is_hr: true });
    expect(result.canViewWorkspaceMembers).toBe(true);
    expect(result.canViewTeamData).toBe(true);
    expect(result.canViewAllData).toBe(false);
  });

  // Branch coverage: each role flag independently true/false
  it("isTeamLeader is false when only is_hr is true", () => {
    const result = computePermissions({ is_hr: true });
    expect(result.isTeamLeader).toBe(false);
  });

  it("isTeamLeader is false when only is_staff is true", () => {
    const result = computePermissions({ is_staff: true });
    expect(result.isTeamLeader).toBe(false);
  });

  it("isTeamLeader is false when only is_superuser is true", () => {
    const result = computePermissions({ is_superuser: true });
    expect(result.isTeamLeader).toBe(false);
  });

  it("canApprove is false for superuser-only (no TL/HR/admin)", () => {
    const result = computePermissions({ is_superuser: true });
    expect(result.canApprove).toBe(false);
  });

  it("canViewWorkspaceMembers is true for team leader", () => {
    const result = computePermissions({ is_team_leader: true });
    expect(result.canViewWorkspaceMembers).toBe(true);
  });

  it("canViewWorkspaceMembers is true for admin", () => {
    const result = computePermissions({ is_staff: true });
    expect(result.canViewWorkspaceMembers).toBe(true);
  });

  it("primaryDashboard is employee when only is_team_leader legacy flag set among non-admin roles", () => {
    const result = computePermissions({ is_team_leader: true, is_hr: false });
    expect(result.primaryDashboard).toBe("team_leader");
  });

  it("availableDashboards contains employee for superuser", () => {
    const result = computePermissions({ is_superuser: true });
    expect(result.availableDashboards).toContain("employee");
  });

  it("availableDashboards contains employee for HR only", () => {
    const result = computePermissions({ is_hr: true });
    expect(result.availableDashboards).toEqual(["hr", "employee"]);
  });

  it("availableDashboards contains employee for team leader only", () => {
    const result = computePermissions({ is_italian_tl_role: true });
    expect(result.availableDashboards).toEqual(["team_leader", "employee"]);
  });

  it("canManageTeam is true for HR (not just TL/admin)", () => {
    const result = computePermissions({ is_hr: true });
    expect(result.canManageTeam).toBe(false);
  });

  it("canViewAllData is false for team leader", () => {
    const result = computePermissions({ is_team_leader: true });
    expect(result.canViewAllData).toBe(false);
  });

  it("canViewAllData is false for HR", () => {
    const result = computePermissions({ is_hr: true });
    expect(result.canViewAllData).toBe(false);
  });

  it("handles undefined user object gracefully", () => {
    const result = computePermissions(undefined);
    expect(result.isEmployee).toBe(true);
    expect(result.isTeamLeader).toBe(false);
  });

  it("handles user object with no role flags set", () => {
    const result = computePermissions({ id: 1, username: "plain" });
    expect(result.isEmployee).toBe(true);
    expect(result.canApprove).toBe(false);
    expect(result.canManageTeam).toBe(false);
    expect(result.canViewTeamData).toBe(false);
    expect(result.canViewAllData).toBe(false);
    expect(result.canViewWorkspaceMembers).toBe(false);
  });

  it("admin + team leader combination prefers admin dashboard", () => {
    const result = computePermissions({ is_staff: true, is_italian_tl_role: true });
    expect(result.primaryDashboard).toBe("admin");
    expect(result.availableDashboards).toContain("admin");
    expect(result.availableDashboards).toContain("team_leader");
  });

  it("HR + team leader combination prefers HR dashboard", () => {
    const result = computePermissions({ is_hr: true, is_albanian_tl_role: true });
    expect(result.primaryDashboard).toBe("hr");
  });

  it("prefers the database cr_admin role over legacy flags", () => {
    expect(computePermissions({ roles: ["cr_admin"] }).isCRAdmin).toBe(true);
    // When roles array is present and non-empty, database roles are authoritative.
    // A non-empty roles array without cr_admin means the user is NOT a CR admin,
    // even if the legacy flag is set.
    expect(computePermissions({ roles: ["hr"], is_cr_admin: true }).isCRAdmin).toBe(false);
  });

  it("falls through to legacy cr_admin flag when roles array is empty", () => {
    // An empty roles array means no database role assignments; legacy flags
    // must still be checked so flag-only users are not locked out.
    expect(computePermissions({ roles: [], is_cr_admin: true }).isCRAdmin).toBe(true);
  });

  it("uses the legacy cr_admin flag when roles are unavailable", () => {
    expect(computePermissions({ is_cr_admin: true }).isCRAdmin).toBe(true);
    expect(computePermissions({ is_cr_admin: false }).isCRAdmin).toBe(false);
    expect(computePermissions({}).isCRAdmin).toBe(false);
    expect(computePermissions(null).isCRAdmin).toBe(false);
  });

  it("CR admin without staff flag is not full admin and not an employee", () => {
    const result = computePermissions({ is_cr_admin: true });
    expect(result.isCRAdmin).toBe(true);
    expect(result.isAdmin).toBe(false);
    // CR admin is a scoped admin, not a regular employee — this exclusion
    // is what prevents CR-only admins from seeing employee nav items
    // (overtime/standby/calendar/leave) in the user shell.
    expect(result.isEmployee).toBe(false);
  });

  it("CR admin + team leader keeps team leader rights and is not employee", () => {
    const result = computePermissions({ is_cr_admin: true, is_italian_tl_role: true });
    expect(result.isCRAdmin).toBe(true);
    expect(result.isTeamLeader).toBe(true);
    expect(result.isEmployee).toBe(false);
    expect(result.canApprove).toBe(true);
  });

  it("CR admin + staff is full admin (hierarchy) and not employee", () => {
    const result = computePermissions({ is_cr_admin: true, is_staff: true });
    expect(result.isCRAdmin).toBe(true);
    expect(result.isAdmin).toBe(true);
    expect(result.isEmployee).toBe(false);
    expect(result.primaryDashboard).toBe("admin");
  });

  // CR user (non-admin with ControlRoomAccess) — see CONTEXT.md rule 11.
  it("CR user (has_control_room_access, no other roles) is isCRUser, not employee", () => {
    const result = computePermissions({ has_control_room_access: true });
    expect(result.isCRUser).toBe(true);
    expect(result.isCRAdmin).toBe(false);
    expect(result.isEmployee).toBe(false);
  });

  it("CR user + CR admin is CR admin only (hierarchy)", () => {
    const result = computePermissions({ has_control_room_access: true, is_cr_admin: true });
    expect(result.isCRAdmin).toBe(true);
    // isCRUser is false because isCRAdmin is true (admin > user)
    expect(result.isCRUser).toBe(false);
    expect(result.isEmployee).toBe(false);
  });

  it("CR user + team leader: higher role wins (isCRUser false)", () => {
    const result = computePermissions({ has_control_room_access: true, is_italian_tl_role: true });
    expect(result.isTeamLeader).toBe(true);
    expect(result.isCRUser).toBe(false);
    expect(result.isEmployee).toBe(false);
  });

  it("CR user + HR: higher role wins (isCRUser false)", () => {
    const result = computePermissions({ has_control_room_access: true, is_hr: true });
    expect(result.isHR).toBe(true);
    expect(result.isCRUser).toBe(false);
  });

  it("CR user + staff: higher role wins (isCRUser false)", () => {
    const result = computePermissions({ has_control_room_access: true, is_staff: true });
    expect(result.isAdmin).toBe(true);
    expect(result.isCRUser).toBe(false);
  });

  it("has_control_room_access flag is computed from user.has_control_room_access", () => {
    expect(computePermissions({ has_control_room_access: true }).isCRUser).toBe(true);
    expect(computePermissions({ has_control_room_access: false }).isCRUser).toBe(false);
    expect(computePermissions({}).isCRUser).toBe(false);
    expect(computePermissions(null).isCRUser).toBe(false);
  });
});
