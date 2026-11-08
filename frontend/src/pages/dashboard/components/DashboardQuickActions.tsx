import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Clock, Radio, type LucideIcon } from "lucide-react";
import { usePermissions } from "@/context/PermissionContext";
import { usePlugins } from "@/context/PluginContext";
import { useVisibleNavItems } from "@/components/layout/hooks/useVisibleNavItems";

const ACTIONS: { path: string; label: string; icon: LucideIcon }[] = [
  { path: "/overtime", label: "Overtime", icon: Clock },
  { path: "/standby", label: "Standby", icon: Radio },
  { path: "/leave-management", label: "Leave", icon: CalendarDays },
];

/**
 * Three one-tap shortcuts at the top of the phone dashboard. A shortcut shows
 * only when the sidebar would show the same page, so role gating has one source.
 */
export const DashboardQuickActions: React.FC = () => {
  const {
    isAdmin,
    isHR,
    isHROnly,
    isHBPROnly,
    isTeamLeader,
    isEmployee,
    isSuperuser,
    isCRAdmin,
    isCRUser,
  } = usePermissions();
  const { activePlugins } = usePlugins();
  const activePluginNames = useMemo(() => activePlugins.map((p) => p.name), [activePlugins]);
  const visiblePaths = new Set(
    useVisibleNavItems(
      isAdmin,
      isHR,
      isTeamLeader,
      isEmployee,
      isSuperuser,
      isCRAdmin,
      isCRUser,
      isHBPROnly,
      activePluginNames,
      isHROnly
    ).map((item) => item.path)
  );
  const actions = ACTIONS.filter((action) => visiblePaths.has(action.path));
  if (!actions.length) return null;

  return (
    <nav aria-label="Quick actions" className="grid grid-cols-3 gap-2 md:hidden">
      {actions.map(({ path, label, icon: Icon }) => (
        <Link
          key={path}
          to={path}
          className="border-border/70 bg-card hover:bg-muted focus-visible:ring-focus flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs font-medium focus-visible:ring-2 focus-visible:outline-hidden"
        >
          <Icon className="text-primary h-5 w-5" aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );
};
