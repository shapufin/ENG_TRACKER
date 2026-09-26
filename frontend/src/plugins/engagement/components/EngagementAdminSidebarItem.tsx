/**
 * EngagementAdminSidebarItem — sidebar nav item for the admin layout.
 *
 * Links to /admin/engagement so the admin stays in the AdminShell when
 * opening Engagement from the Extensions flyout. Mirrors
 * AnalyticsAdminSidebarItem/ControlRoomAdminSidebarItem (admin-layout
 * layoutId shared across the group so the active bar animates as one).
 *
 * Gated on isAdmin only, not isTeamLeader || isAdmin: /admin/* is wrapped by
 * SuperuserRoute (isSuperuser || isAdmin only), so a plain TL who could see
 * this link would get redirected to /dashboard on click — a dead link. Same
 * fix already applied to TLScorecardAdminSidebarItem.
 */
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Gauge } from "lucide-react";
import { motion } from "framer-motion";
import { usePermissions } from "@/context/PermissionContext";
import { LAYOUT_ID, useMotionTransition } from "@/lib/motion";

const EngagementAdminSidebarItem: React.FC = () => {
  const location = useLocation();
  const { isAdmin } = usePermissions();
  const activeBarTransition = useMotionTransition({ type: "spring", stiffness: 400, damping: 30 });
  const isActive = location.pathname.startsWith("/admin/engagement");

  if (!isAdmin) return null;

  return (
    <li>
      <Link
        to="/admin/engagement"
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
        <Gauge className={`h-5 w-5 shrink-0 ${isActive ? "text-primary" : ""}`} />
        <span>Engagement</span>
      </Link>
    </li>
  );
};

export default EngagementAdminSidebarItem;
