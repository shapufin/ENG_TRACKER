import { useMemo } from "react";
import {
  LayoutDashboard,
  Users,
  Building2,
  Cpu,
  Briefcase,
  KeyRound,
  BarChart3,
  CalendarDays,
  Clock,
  Moon,
  Sun,
  Settings2,
  Globe,
  Ticket,
  Upload,
  Wallet,
  Receipt,
  Award,
} from "lucide-react";

export interface AdminNavItem {
  path: string;
  label: string;
  icon: React.ElementType;
  group: string;
  exact?: boolean;
  adminOnly?: boolean;
  /** Restricted to full admins (hidden from CR-only admins). */
  fullAdminOnly?: boolean;
  /** Plugin name this item depends on. When set, the item is only shown
   *  if that plugin is in the active plugins list. Prevents dead links to
   *  plugin routes that don't exist when the plugin is disabled. */
  pluginName?: string;
  /** Elevated roles allowed to see this item. */
  roles?: ("admin" | "superuser" | "hr")[];
}

const allAdminNavItems: AdminNavItem[] = [
  {
    path: "/admin",
    label: "Dashboard",
    icon: LayoutDashboard,
    group: "Overview",
    exact: true,
    fullAdminOnly: true,
  },
  { path: "/admin/users", label: "Users", icon: Users, group: "People" },
  { path: "/admin/teams", label: "Teams", icon: Building2, group: "People", fullAdminOnly: true },
  { path: "/admin/techs", label: "Tech", icon: Cpu, group: "People", fullAdminOnly: true },
  {
    path: "/admin/clients",
    label: "Clients",
    icon: Briefcase,
    group: "People",
    fullAdminOnly: true,
  },
  {
    path: "/admin/skills/catalog",
    label: "Skills Catalog",
    icon: Award,
    group: "People",
    pluginName: "skills",
    roles: ["admin", "superuser", "hr"],
  },
  {
    path: "/admin/resource-access",
    label: "Resource Access",
    icon: KeyRound,
    group: "Governance",
    fullAdminOnly: true,
  },
  {
    path: "/admin/reports",
    label: "Reports",
    icon: BarChart3,
    group: "Governance",
    fullAdminOnly: true,
  },
  {
    path: "/admin/calendars",
    label: "Calendar Sharing",
    icon: CalendarDays,
    group: "Operations",
    fullAdminOnly: true,
  },
  {
    path: "/admin/overtime-logs",
    label: "Overtime Logs",
    icon: Clock,
    group: "Operations",
    fullAdminOnly: true,
  },
  {
    path: "/admin/standby-logs",
    label: "Standby Logs",
    icon: Moon,
    group: "Operations",
    fullAdminOnly: true,
  },
  {
    path: "/admin/leave-requests",
    label: "Leave Requests",
    icon: Sun,
    group: "Operations",
    adminOnly: true,
    fullAdminOnly: true,
  },
  {
    path: "/admin/leave-balances",
    label: "Leave Balances",
    icon: CalendarDays,
    group: "Operations",
    adminOnly: true,
    fullAdminOnly: true,
  },
  {
    path: "/admin/plugins",
    label: "Plugins",
    icon: Settings2,
    group: "Tools",
    fullAdminOnly: true,
  },
  {
    path: "/admin/ticket-kpi/mappings",
    label: "Ticket KPI",
    icon: Ticket,
    group: "Tools",
    fullAdminOnly: true,
    pluginName: "ticket_kpi",
  },
  {
    path: "/admin/data-import",
    label: "Data Import",
    icon: Upload,
    group: "Tools",
    adminOnly: true,
    fullAdminOnly: true,
    pluginName: "data_import",
  },
  {
    path: "/admin/payroll/wages",
    label: "Wages",
    icon: Wallet,
    group: "Payroll",
    fullAdminOnly: true,
    pluginName: "payroll",
  },
  {
    path: "/admin/payroll/runs",
    label: "Payrolls",
    icon: Receipt,
    group: "Payroll",
    fullAdminOnly: true,
    pluginName: "payroll",
  },
  {
    path: "/admin/payroll/calendar",
    label: "Calendar",
    icon: CalendarDays,
    group: "Payroll",
    fullAdminOnly: true,
    pluginName: "payroll",
  },
  {
    path: "/admin/payroll/settings",
    label: "Settings",
    icon: Settings2,
    group: "Payroll",
    fullAdminOnly: true,
    pluginName: "payroll",
  },
  {
    path: "/admin/global-settings",
    label: "Global Settings",
    icon: Globe,
    group: "System",
    fullAdminOnly: true,
  },
];

/**
 * Build the admin sidebar nav items.
 *
 * - ``isAdmin`` (is_staff) sees everything (minus adminOnly items if not
 *   superuser/staff — kept for backward compat).
 * - ``isCRAdmin`` (scoped, non-staff) sees only items NOT marked
 *   ``fullAdminOnly`` — currently just "Users". The Control Room Access
 *   link is injected separately via the ``admin-sidebar-nav`` plugin slot.
 * - ``activePluginNames`` is the set of currently active plugin names.
 *   Items with a ``pluginName`` are only shown when that plugin is active,
 *   preventing dead links to plugin routes that don't exist when the
 *   plugin is disabled.
 */
export const useAdminNavItems = (
  isAdmin: boolean,
  isHR: boolean = false,
  isSuperuser: boolean = false,
  isCRAdmin: boolean = false,
  activePluginNames: string[] = []
) =>
  useMemo(
    () =>
      allAdminNavItems.filter((item) => {
        if (item.adminOnly && !isAdmin) return false;
        if (item.roles) {
          const roleMatches =
            (isAdmin && item.roles.includes("admin")) ||
            (isSuperuser && item.roles.includes("superuser")) ||
            (isHR && item.roles.includes("hr"));
          if (!roleMatches) return false;
        }
        if (isCRAdmin && !isAdmin && item.fullAdminOnly) return false;
        if (item.pluginName && !activePluginNames.includes(item.pluginName)) return false;
        return true;
      }),
    [isAdmin, isHR, isSuperuser, isCRAdmin, activePluginNames]
  );
