/**
 * AnalyticsAdminSidebarItem — sidebar nav item for the admin layout.
 *
 * Links to /admin/analytics so the admin stays in the AdminShell when
 * opening Analytics from the Extensions flyout. Mirrors the
 * ControlRoomAdminSidebarItem pattern (admin-layout layoutId, no
 * useSidebarCollapsed — the admin flyout handles collapsed state).
 */
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { BarChart3 } from "lucide-react";
import { motion } from "framer-motion";
import { usePluginPermissions } from "@/hooks/usePluginPermissions";
import { usePermissions } from "@/context/PermissionContext";

const AnalyticsAdminSidebarItem: React.FC = () => {
  const location = useLocation();
  const { canView } = usePluginPermissions();
  const { isAdmin, isSuperuser, isHR, isTeamLeader, isCRAdmin } = usePermissions();
  const isActive = location.pathname.startsWith("/admin/analytics");

  // CR-only admins are scoped to /admin/users and /admin/control-room/* only.
  const isCROnlyAdmin = isCRAdmin && !isAdmin && !isSuperuser && !isHR && !isTeamLeader;
  if (isCROnlyAdmin || !canView("analytics")) return null;

  return (
    <li>
      <Link
        to="/admin/analytics"
        role="menuitem"
        className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          isActive
            ? "bg-primary/10 text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        }`}
      >
        {isActive && (
          <motion.div
            layoutId="admin-plugin-sidebar-active"
            className="absolute inset-y-1 left-0 w-[3px] rounded-full bg-primary"
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          />
        )}
        <BarChart3 className={`h-5 w-5 shrink-0 ${isActive ? "text-primary" : ""}`} />
        <span>Analytics</span>
      </Link>
    </li>
  );
};

export default AnalyticsAdminSidebarItem;
