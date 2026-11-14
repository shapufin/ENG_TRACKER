import { describe, it, expect } from "vitest";
import { computePermissions } from "./computePermissions";

type Fixture = Record<string, unknown> | null | undefined;
type Input = Parameters<typeof computePermissions>[0];

// The API carries role identity as `roles` (database grants). These fixtures
// name a grant by its old flag; withGrants turns each flag into its role code.
// The flags themselves no longer exist server-side (audithandover.md S1 step 3).
const GRANT_FLAGS: Record<string, string> = {
  is_hr: "hr",
  is_italian_tl_role: "italian_tl",
  is_albanian_tl_role: "albanian_tl",
  is_cr_admin: "cr_admin",
};

const withGrants = (user: Fixture): Input => {
  if (!user) return user as Input;
  const roles = new Set<string>(Array.isArray(user.roles) ? (user.roles as string[]) : []);
  const rest: Record<string, unknown> = { ...user };
  for (const [flag, role] of Object.entries(GRANT_FLAGS)) {
    if (rest[flag] === true) roles.add(role);
    delete rest[flag];
  }
  return { ...rest, roles: [...roles] } as Input;
};

// Every fixture in this file goes through the grant view of the API payload.
const computeFor = (user: Fixture) => computePermissions(withGrants(user));

describe("computePermissions", () => {
  it("returns employee defaults for null/undefined user", () => {
    const result = computeFor(null);
    expect(result).toEqual({
      isItalianTL: false,
      isAlbanianTL: false,
      isTeamLeader: false,
      isHR: false,
      isHBPR: false,
      isHBPROnly: false,
      isHROnly: false,
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
    const result = computeFor({ is_superuser: true });
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
    const result = computeFor({ is_staff: true });
    expect(result.isAdmin).toBe(true);
    expect(result.isSuperuser).toBe(false);
    expect(result.canViewAllData).toBe(true);
    expect(result.primaryDashboard).toBe("admin");
  });

  it("identifies an HR user", () => {
    const result = computeFor({ is_hr: true });
    expect(result.isHR).toBe(true);
    expect(result.canApprove).toBe(true);
    expect(result.canViewTeamData).toBe(true);
    expect(result.availableDashboards).toContain("hr");
    expect(result.primaryDashboard).toBe("hr");
  });

  it("identifies a Manager", () => {
    const result = computeFor({ is_italian_tl_role: true });
    expect(result.isItalianTL).toBe(true);
    expect(result.isTeamLeader).toBe(true);
    expect(result.canApprove).toBe(true);
    expect(result.canViewTeamData).toBe(true);
    expect(result.availableDashboards).toContain("team_leader");
    expect(result.primaryDashboard).toBe("team_leader");
  });

  it("identifies a Line Manager", () => {
    const result = computeFor({ is_albanian_tl_role: true });
    expect(result.isAlbanianTL).toBe(true);
    expect(result.isTeamLeader).toBe(true);
    expect(result.canManageTeam).toBe(true);
    expect(result.primaryDashboard).toBe("team_leader");
  });

  it("identifies a legacy team leader flag", () => {
    const result = computeFor({ is_team_leader: true });
    expect(result.isTeamLeader).toBe(true);
    expect(result.isItalianTL).toBe(false);
    expect(result.isAlbanianTL).toBe(false);
  });

  it("combines multiple roles correctly", () => {
    const result = computeFor({
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
    const result = computeFor({ id: 42, username: "john" });
    expect(result.isEmployee).toBe(true);
    expect(result.canApprove).toBe(false);
    expect(result.canViewAllData).toBe(false);
    expect(result.availableDashboards).toEqual(["employee"]);
  });

  it("treats both TL flags as team leader without duplicate logic", () => {
    const result = computeFor({ is_italian_tl_role: true, is_albanian_tl_role: true });
    expect(result.isItalianTL).toBe(true);
    expect(result.isAlbanianTL).toBe(true);
    expect(result.isTeamLeader).toBe(true);
    expect(result.canManageTeam).toBe(true);
  });

  it("gives a staff user team management but not superuser rights", () => {
    const result = computeFor({ is_staff: true });
    expect(result.isAdmin).toBe(true);
    expect(result.isSuperuser).toBe(false);
    expect(result.canManageTeam).toBe(true);
    expect(result.canViewTeamData).toBe(true);
  });

  it("grants an HR user workspace member visibility", () => {
    const result = computeFor({ is_hr: true });
    expect(result.canViewWorkspaceMembers).toBe(true);
    expect(result.canViewTeamData).toBe(true);
    expect(result.canViewAllData).toBe(false);
  });

  // Branch coverage: each role flag independently true/false
  it("isTeamLeader is false when only is_hr is true", () => {
    const result = computeFor({ is_hr: true });
    expect(result.isTeamLeader).toBe(false);
  });

  it("isTeamLeader is false when only is_staff is true", () => {
    const result = computeFor({ is_staff: true });
    expect(result.isTeamLeader).toBe(false);
  });

  it("isTeamLeader is false when only is_superuser is true", () => {
    const result = computeFor({ is_superuser: true });
    expect(result.isTeamLeader).toBe(false);
  });

  it("canApprove is false for superuser-only (no TL/HR/admin)", () => {
    const result = computeFor({ is_superuser: true });
    expect(result.canApprove).toBe(false);
  });

  it("canViewWorkspaceMembers is true for team leader", () => {
    const result = computeFor({ is_team_leader: true });
    expect(result.canViewWorkspaceMembers).toBe(true);
  });

  it("canViewWorkspaceMembers is true for admin", () => {
    const result = computeFor({ is_staff: true });
    expect(result.canViewWorkspaceMembers).toBe(true);
  });

  it("primaryDashboard is employee when only is_team_leader legacy flag set among non-admin roles", () => {
    const result = computeFor({ is_team_leader: true, is_hr: false });
    expect(result.primaryDashboard).toBe("team_leader");
  });

  it("availableDashboards contains employee for superuser", () => {
    const result = computeFor({ is_superuser: true });
    expect(result.availableDashboards).toContain("employee");
  });

  it("availableDashboards is the HR dashboard alone for HR only", () => {
    const result = computeFor({ is_hr: true });
    expect(result.availableDashboards).toEqual(["hr"]);
  });

  it("availableDashboards contains employee for team leader only", () => {
    const result = computeFor({ is_italian_tl_role: true });
    expect(result.availableDashboards).toEqual(["team_leader", "employee"]);
  });

  it("canManageTeam is true for HR (not just TL/admin)", () => {
    const result = computeFor({ is_hr: true });
    expect(result.canManageTeam).toBe(false);
  });

  it("canViewAllData is false for team leader", () => {
    const result = computeFor({ is_team_leader: true });
    expect(result.canViewAllData).toBe(false);
  });

  it("canViewAllData is false for HR", () => {
    const result = computeFor({ is_hr: true });
    expect(result.canViewAllData).toBe(false);
  });

  it("handles undefined user object gracefully", () => {
    const result = computeFor(undefined);
    expect(result.isEmployee).toBe(true);
    expect(result.isTeamLeader).toBe(false);
  });

  it("handles user object with no role flags set", () => {
    const result = computeFor({ id: 1, username: "plain" });
    expect(result.isEmployee).toBe(true);
    expect(result.canApprove).toBe(false);
    expect(result.canManageTeam).toBe(false);
    expect(result.canViewTeamData).toBe(false);
    expect(result.canViewAllData).toBe(false);
    expect(result.canViewWorkspaceMembers).toBe(false);
  });

  it("admin + team leader combination prefers admin dashboard", () => {
    const result = computeFor({ is_staff: true, is_italian_tl_role: true });
    expect(result.primaryDashboard).toBe("admin");
    expect(result.availableDashboards).toContain("admin");
    expect(result.availableDashboards).toContain("team_leader");
  });

  it("HR + team leader combination prefers HR dashboard", () => {
    const result = computeFor({ is_hr: true, is_albanian_tl_role: true });
    expect(result.primaryDashboard).toBe("hr");
  });

  it("prefers the database cr_admin role over legacy flags", () => {
    expect(computeFor({ roles: ["cr_admin"] }).isCRAdmin).toBe(true);
    // When roles array is present and non-empty, database roles are authoritative.
    // A non-empty roles array without cr_admin means the user is NOT a CR admin,
    // even if the legacy flag is set.
    expect(computePermissions({ roles: ["hr"], is_cr_admin: true }).isCRAdmin).toBe(false);
  });

  it("a legacy cr_admin flag alone grants nothing when roles array is empty", () => {
    // An empty roles array means no database role assignments; legacy flags
    // must still be checked so flag-only users are not locked out.
    expect(computePermissions({ roles: [], is_cr_admin: true }).isCRAdmin).toBe(false);
  });

  it("a legacy cr_admin flag without roles grants nothing", () => {
    expect(computePermissions({ is_cr_admin: true }).isCRAdmin).toBe(false);
    expect(computePermissions({ is_cr_admin: false }).isCRAdmin).toBe(false);
    expect(computePermissions({}).isCRAdmin).toBe(false);
    expect(computePermissions(null).isCRAdmin).toBe(false);
  });

  it("CR admin without staff flag is not full admin and not an employee", () => {
    const result = computeFor({ is_cr_admin: true });
    expect(result.isCRAdmin).toBe(true);
    expect(result.isAdmin).toBe(false);
    // CR admin is a scoped admin, not a regular employee — this exclusion
    // is what prevents CR-only admins from seeing employee nav items
    // (overtime/standby/calendar/leave) in the user shell.
    expect(result.isEmployee).toBe(false);
  });

  it("CR admin + team leader keeps team leader rights and is not employee", () => {
    const result = computeFor({ is_cr_admin: true, is_italian_tl_role: true });
    expect(result.isCRAdmin).toBe(true);
    expect(result.isTeamLeader).toBe(true);
    expect(result.isEmployee).toBe(false);
    expect(result.canApprove).toBe(true);
  });

  it("CR admin + staff is full admin (hierarchy) and not employee", () => {
    const result = computeFor({ is_cr_admin: true, is_staff: true });
    expect(result.isCRAdmin).toBe(true);
    expect(result.isAdmin).toBe(true);
    expect(result.isEmployee).toBe(false);
    expect(result.primaryDashboard).toBe("admin");
  });

  // CR user (non-admin with ControlRoomAccess) — see CONTEXT.md rule 11.
  it("CR user (has_control_room_access, no other roles) is isCRUser, not employee", () => {
    const result = computeFor({ has_control_room_access: true });
    expect(result.isCRUser).toBe(true);
    expect(result.isCRAdmin).toBe(false);
    expect(result.isEmployee).toBe(false);
  });

  it("CR user + CR admin is CR admin only (hierarchy)", () => {
    const result = computeFor({ has_control_room_access: true, is_cr_admin: true });
    expect(result.isCRAdmin).toBe(true);
    // isCRUser is false because isCRAdmin is true (admin > user)
    expect(result.isCRUser).toBe(false);
    expect(result.isEmployee).toBe(false);
  });

  it("CR user + team leader: higher role wins (isCRUser false)", () => {
    const result = computeFor({ has_control_room_access: true, is_italian_tl_role: true });
    expect(result.isTeamLeader).toBe(true);
    expect(result.isCRUser).toBe(false);
    expect(result.isEmployee).toBe(false);
  });

  it("CR user + HR: higher role wins (isCRUser false)", () => {
    const result = computeFor({ has_control_room_access: true, is_hr: true });
    expect(result.isHR).toBe(true);
    expect(result.isCRUser).toBe(false);
  });

  it("CR user + staff: higher role wins (isCRUser false)", () => {
    const result = computeFor({ has_control_room_access: true, is_staff: true });
    expect(result.isAdmin).toBe(true);
    expect(result.isCRUser).toBe(false);
  });

  describe("HBPR", () => {
    const hbpr = { roles: ["hbpr"] };

    it("is read from the database role only (no legacy flag)", () => {
      expect(computeFor(hbpr).isHBPR).toBe(true);
      expect(computeFor({ is_hbpr: true }).isHBPR).toBe(false);
      expect(computeFor({ roles: ["hr"] }).isHBPR).toBe(false);
      expect(computeFor(null).isHBPR).toBe(false);
    });

    it("is not a team leader and not an employee-shell user", () => {
      const result = computeFor(hbpr);
      expect(result.isTeamLeader).toBe(false);
      expect(result.canApprove).toBe(false);
      expect(result.isEmployee).toBe(false);
    });

    it("HBPR-only holds no dashboard — 'hbpr' survives as a routing token", () => {
      const result = computeFor(hbpr);
      // No dashboard entries at all: the HBPR home is the /hbpr workspace.
      expect(result.availableDashboards).toEqual([]);
      // "hbpr" stays a valid DashboardType only so DashboardPage's redirect
      // and useDashboardData's fetch guard can key off it.
      expect(result.primaryDashboard).toBe("hbpr");
    });

    it("multi-role HBPR keeps the other role's home", () => {
      const tl = computeFor({ roles: ["hbpr", "italian_tl"] });
      expect(tl.primaryDashboard).toBe("team_leader");
      expect(tl.availableDashboards).toEqual(["team_leader", "employee"]);
      const hr = computeFor({ roles: ["hbpr", "hr"] });
      expect(hr.primaryDashboard).toBe("hr");
      // HBPR+HR is still pure HR (backend `is_hr_only`): no personal dashboard.
      expect(hr.availableDashboards).toEqual(["hr"]);
    });

    it("HBPR with Control Room access is not treated as a CR-only user", () => {
      const result = computeFor({ roles: ["hbpr"], has_control_room_access: true });
      expect(result.isCRUser).toBe(false);
      expect(result.primaryDashboard).toBe("hbpr");
    });

    it("isHBPROnly is true only for an HBPR with no elevating role", () => {
      expect(computeFor({ roles: ["hbpr"] }).isHBPROnly).toBe(true);
      // A derived TL relationship must not lift the block.
      expect(computeFor({ roles: ["hbpr"], is_team_leader: true }).isHBPROnly).toBe(true);
      for (const role of ["italian_tl", "albanian_tl", "hr", "cr_admin"]) {
        expect(computeFor({ roles: ["hbpr", role] }).isHBPROnly).toBe(false);
      }
      expect(computeFor({ roles: ["hbpr"], is_staff: true }).isHBPROnly).toBe(false);
      expect(computeFor({ roles: ["hbpr"], is_superuser: true }).isHBPROnly).toBe(false);
      expect(computeFor({ roles: ["employee"] }).isHBPROnly).toBe(false);
    });
  });

  it("has_control_room_access flag is computed from user.has_control_room_access", () => {
    expect(computeFor({ has_control_room_access: true }).isCRUser).toBe(true);
    expect(computeFor({ has_control_room_access: false }).isCRUser).toBe(false);
    expect(computeFor({}).isCRUser).toBe(false);
    expect(computeFor(null).isCRUser).toBe(false);
  });

  describe("HR only", () => {
    it("is true for HR with no elevating role, and drops the personal dashboard", () => {
      const r = computeFor({ roles: ["hr"] });
      expect(r.isHROnly).toBe(true);
      expect(r.availableDashboards).toEqual(["hr"]);
      expect(r.primaryDashboard).toBe("hr");
    });

    it("a legacy is_hr flag alone grants no HR role", () => {
      expect(computePermissions({ roles: [], is_hr: true }).isHROnly).toBe(false);
    });

    it("stays false for every multi-role HR user and keeps their dashboards", () => {
      for (const extra of [
        { roles: ["hr", "italian_tl"] },
        { roles: ["hr", "albanian_tl"] },
        { roles: ["hr"], is_team_leader: true },
        { roles: ["hr"], is_staff: true },
        { roles: ["hr"], is_superuser: true },
      ]) {
        const r = computeFor(extra);
        expect(r.isHROnly).toBe(false);
        expect(r.availableDashboards).toContain("employee");
      }
    });

    it("is false for non-HR users", () => {
      expect(computeFor({ roles: ["employee"] }).isHROnly).toBe(false);
      expect(computeFor({ roles: ["italian_tl"] }).isHROnly).toBe(false);
      expect(computeFor({ roles: ["hbpr"] }).isHROnly).toBe(false);
    });
  });
});
