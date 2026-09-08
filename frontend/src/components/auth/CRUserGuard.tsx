import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { usePermissions } from "@/context/PermissionContext";

/**
 * CRUserGuard — blocks scoped CR identities from employee shell routes.
 *
 * A CR-only user (non-admin with active ControlRoomAccess, no other
 * elevated role) must not reach /dashboard, /overtime, /standby,
 * /leave-management, /calendar, /team, or /hr/reports. Their home is
 * /control-room/dashboard (injected via PluginSlot). A CR-only admin uses
 * the same app-shell Control Room dashboard as its home. Multi-role users
 * (CR + TL/HR/admin) pass through normally.
 *
 * /settings is intentionally left OUTSIDE this guard — CR users have
 * a Settings variant (read-only scope card, no My Clients section).
 */
export const CRUserGuard: React.FC = () => {
  const { isCRUser, isCRAdmin, isAdmin, isSuperuser, isHR, isTeamLeader } = usePermissions();
  const isCROnlyAdmin = isCRAdmin && !isAdmin && !isSuperuser && !isHR && !isTeamLeader;

  if (isCRUser) {
    return <Navigate to="/control-room/dashboard" replace />;
  }

  if (isCROnlyAdmin) {
    return <Navigate to="/control-room/dashboard" replace />;
  }

  return <Outlet />;
};
