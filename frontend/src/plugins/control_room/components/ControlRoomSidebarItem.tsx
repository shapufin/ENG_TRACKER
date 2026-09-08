/**
 * ControlRoomSidebarItem — sidebar nav item for the app layout.
 *
 * Shows only when the user has Control Room access (active record).
 * Uses useControlRoomMe() — NOT usePluginPermissions — because
 * ControlRoomAccess IS the permission (plan §6.2). Delegates rendering
 * to the shared `SidebarNavLink`, which handles collapsed-mode active
 * indicator + portal tooltip behavior.
 */
import React from "react";
import { useLocation } from "react-router-dom";
import { Activity, Shield } from "lucide-react";
import { useControlRoomMe } from "../hooks/useControlRoomAccess";
import { usePermissions } from "@/context/PermissionContext";
import { SidebarNavLink } from "@/components/layout/SidebarNavLink";

const ControlRoomSidebarItem: React.FC = () => {
  const location = useLocation();
  const { data, isLoading } = useControlRoomMe();
  const { isCRAdmin } = usePermissions();
  const isDashboardActive = location.pathname === "/control-room/dashboard";
  const isAccessActive = location.pathname.startsWith("/control-room/access");

  if (isLoading) return null;
  if (!data?.has_access) return null;

  return (
    <>
      <SidebarNavLink
        to="/control-room/dashboard"
        label="Control Room"
        icon={Activity}
        isActive={isDashboardActive}
      />
      {isCRAdmin && (
        <SidebarNavLink
          to="/control-room/access"
          label="Control Room Access"
          icon={Shield}
          isActive={isAccessActive}
        />
      )}
    </>
  );
};

export default ControlRoomSidebarItem;
