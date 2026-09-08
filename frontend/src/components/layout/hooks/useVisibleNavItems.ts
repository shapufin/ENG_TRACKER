import { useMemo } from "react";
import {
  LayoutDashboard,
  Clock,
  Briefcase,
  Calendar,
  CalendarDays,
  UserCheck,
  FolderKanban,
  Puzzle,
  Shield,
  Settings,
  Ticket,
  Users,
} from "lucide-react";

export type NavSection = "core" | "leadership" | "skills-kpi" | "system";

export const NAV_SECTION_ORDER: NavSection[] = ["core", "leadership", "skills-kpi", "system"];

export const NAV_SECTION_LABELS: Record<NavSection, string> = {
  core: "Core Ops",
  leadership: "Leadership",
  "skills-kpi": "Skills & KPI",
  system: "System",
};

export interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
  /** Static sidebar section this item groups under (rendered as a mono
   * uppercase label by SidebarNav). Required so new items cannot skip it. */
  section: NavSection;
  roles?: ("employee" | "team_leader" | "hr" | "admin" | "superuser")[];
  /** When true, the item is only active on an exact path match (not
   * `startsWith`). Use for paths that are prefixes of other nav items
   * (e.g. `/admin` is a prefix of `/admin/plugins`). */
  exact?: boolean;
  /** Visible to a CR-only user (non-admin with ControlRoomAccess).
   * When false/absent, the item is hidden from CR-only users. The CR
   * dashboard sidebar item is injected separately via PluginSlot and
   * is unaffected by this flag. */
  crUserVisible?: boolean;
}

const allNavItems: NavItem[] = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard, section: "core" },
  {
    path: "/overtime",
    label: "Overtime",
    icon: Clock,
    section: "core",
    roles: ["employee", "team_leader", "hr"],
  },
  {
    path: "/standby",
    label: "Standby",
    icon: Briefcase,
    section: "core",
    roles: ["employee", "team_leader", "hr"],
  },
  { path: "/leave-management", label: "Leave", icon: Calendar, section: "core" },
  { path: "/calendar", label: "Calendar", icon: CalendarDays, section: "core" },
  {
    path: "/team/approvals",
    label: "Pending Approvals",
    icon: UserCheck,
    section: "leadership",
    roles: ["team_leader"],
  },
  {
    path: "/team",
    label: "Team Overview",
    icon: FolderKanban,
    section: "leadership",
    roles: ["team_leader"],
    exact: true,
  },
  {
    path: "/hr/reports",
    label: "HR Reports",
    icon: Briefcase,
    section: "leadership",
    roles: ["hr"],
  },
  { path: "/admin/plugins", label: "Plugins", icon: Puzzle, section: "system", roles: ["admin"] },
  {
    path: "/admin",
    label: "Admin",
    icon: Shield,
    section: "system",
    roles: ["admin"],
    exact: true,
  },
  {
    path: "/ticket-kpi/dashboard",
    label: "Ticket KPI",
    icon: Ticket,
    section: "skills-kpi",
  },
  {
    path: "/ticket-kpi/team",
    label: "Team Performance",
    icon: Users,
    section: "skills-kpi",
    roles: ["team_leader"],
  },
  {
    path: "/ticket-kpi/team-management",
    label: "Upload Management",
    icon: Users,
    section: "skills-kpi",
    roles: ["team_leader"],
  },
  { path: "/settings", label: "Settings", icon: Settings, section: "system", crUserVisible: true },
];

export const useVisibleNavItems = (
  isAdmin: boolean,
  isHR: boolean,
  isTeamLeader: boolean,
  isEmployee: boolean,
  isSuperuser: boolean,
  isCRAdmin: boolean = false,
  isCRUser: boolean = false
) =>
  useMemo(() => {
    // A CR-only admin (cr_admin role, no other elevated role) uses the
    // same user shell as a CR user. The Control Room dashboard/access
    // links are injected separately via PluginSlot; Settings remains a
    // standard nav item.
    // CR admins who ALSO hold TL/HR/admin roles keep those role items.
    const isCROnlyAdmin = isCRAdmin && !isAdmin && !isSuperuser && !isHR && !isTeamLeader;
    // A CR-only user (non-admin with ControlRoomAccess, no other elevated
    // role) sees only Settings. Their primary view is /control-room/dashboard,
    // injected via PluginSlot as ControlRoomSidebarItem — NOT a standard nav
    // item. The employee /dashboard is hidden; CR users must not reach the
    // employee shell home. Multi-role users (CR + TL/HR/admin) are NOT
    // CR-only users (isCRUser is false when a higher role is present) and keep
    // their higher role's nav.
    const isCRScoped = isCRUser || isCROnlyAdmin;
    return allNavItems.filter((item) => {
      if (isCRScoped && !item.crUserVisible) return false;
      if (!item.roles) return true;
      if (isSuperuser) return true;
      if (isAdmin && item.roles.includes("admin")) return true;
      if (isHR && item.roles.includes("hr")) return true;
      if (isTeamLeader && item.roles.includes("team_leader")) return true;
      if (isEmployee && item.roles.includes("employee")) return true;
      return false;
    });
  }, [isAdmin, isHR, isTeamLeader, isEmployee, isSuperuser, isCRAdmin, isCRUser]);
