/**
 * TLScorecardAdminSidebarItem — sidebar nav item for the admin layout.
 *
 * Links to /admin/tl-scorecard so the admin stays in the AdminShell when
 * opening TL Scorecard from the Extensions flyout. Gated on isAdmin only
 * (not isTeamLeader || isAdmin like EngagementAdminSidebarItem) because
 * /admin/* routes are wrapped by SuperuserRoute, which only allows
 * isSuperuser || isAdmin through — a plain team leader would see this link
 * but get redirected to /dashboard on click, same as engagement's existing
 * broken affordance. Mirrors AnalyticsAdminSidebarItem/
 * ControlRoomAdminSidebarItem (admin-layout layoutId shared across the
 * group so the active bar animates as one).
 */
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import { motion } from "framer-motion";
import { usePermissions } from "@/context/PermissionContext";
import { LAYOUT_ID, useMotionTransition } from "@/lib/motion";

const TLScorecardAdminSidebarItem: React.FC = () => {
  const location = useLocation();
  const { isAdmin } = usePermissions();
  const activeBarTransition = useMotionTransition({ type: "spring", stiffness: 400, damping: 30 });
  const isActive = location.pathname.startsWith("/admin/tl-scorecard");

  if (!isAdmin) return null;

  return (
    <li>
      <Link
        to="/admin/tl-scorecard"
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
        <ClipboardList className={`h-5 w-5 shrink-0 ${isActive ? "text-primary" : ""}`} />
        <span>TL Scorecard</span>
      </Link>
    </li>
  );
};

export default TLScorecardAdminSidebarItem;
