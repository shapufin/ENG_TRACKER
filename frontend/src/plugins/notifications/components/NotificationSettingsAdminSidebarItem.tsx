/**
 * NotificationSettingsAdminSidebarItem: System-group entry in the admin sidebar.
 *
 * Rendered through the plugin's admin-sidebar-nav-system slot, so it appears
 * only while the notifications plugin is active. Mirrors AnalyticsAdminSidebarItem.
 */
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell } from "lucide-react";
import { motion } from "framer-motion";
import { usePermissions } from "@/context/PermissionContext";
import { LAYOUT_ID, useMotionTransition } from "@/lib/motion";

const NotificationSettingsAdminSidebarItem: React.FC = () => {
  const location = useLocation();
  const { isAdmin, isSuperuser, isHR, isTeamLeader, isCRAdmin } = usePermissions();
  const activeBarTransition = useMotionTransition({ type: "spring", stiffness: 400, damping: 30 });
  const isActive = location.pathname.startsWith("/admin/notifications");

  // CR-only admins are scoped to /admin/users and /admin/control-room/* only.
  const isCROnlyAdmin = isCRAdmin && !isAdmin && !isSuperuser && !isHR && !isTeamLeader;
  if (isCROnlyAdmin || (!isAdmin && !isSuperuser)) return null;

  return (
    <li>
      <Link
        to="/admin/notifications"
        role="menuitem"
        className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          isActive
            ? "bg-primary/10 text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        }`}
      >
        {isActive && (
          <motion.div
            layoutId={LAYOUT_ID.adminPluginSidebarActive}
            className="absolute inset-y-1 left-0 w-[3px] rounded-full bg-primary"
            transition={activeBarTransition}
          />
        )}
        <Bell className={`h-5 w-5 shrink-0 ${isActive ? "text-primary" : ""}`} />
        <span>Notifications</span>
      </Link>
    </li>
  );
};

export default NotificationSettingsAdminSidebarItem;
