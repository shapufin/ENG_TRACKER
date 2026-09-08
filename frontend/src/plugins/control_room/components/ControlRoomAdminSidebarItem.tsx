/**
 * ControlRoomAdminSidebarItem — sidebar nav item for the admin layout.
 *
 * Shows only for admin/staff/CR-admin users. Renders the Control Room
 * access management link. The dashboard link lives in
 * ControlRoomSidebarItem (app shell sidebar), not here — full admins
 * don't use the CR dashboard as their home.
 */
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Shield } from "lucide-react";
import { motion } from "framer-motion";
import { usePermissions } from "@/context/PermissionContext";

const ControlRoomAdminSidebarItem: React.FC = () => {
  const location = useLocation();
  const { isAdmin, isSuperuser, isCRAdmin } = usePermissions();
  const isActive =
    location.pathname.startsWith("/admin/control-room") ||
    location.pathname.startsWith("/control-room/access");

  if (!isAdmin && !isSuperuser && !isCRAdmin) return null;

  return (
    <li>
      <Link
        to="/admin/control-room/access"
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
        <Shield className={`h-5 w-5 shrink-0 ${isActive ? "text-primary" : ""}`} />
        <span>Control Room Access</span>
      </Link>
    </li>
  );
};

export default ControlRoomAdminSidebarItem;
