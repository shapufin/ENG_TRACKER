import React from "react";
import { Navigate } from "react-router-dom";
import { usePermissions } from "@/context/PermissionContext";

/**
 * HomeRedirect — role-aware redirect for "/" and the catch-all "*".
 *
 * - CR user → /control-room/dashboard
 * - CR-only admin → /control-room/dashboard
 * - everyone else (including unauthenticated) → /dashboard
 *   (ProtectedRoute then sends unauthenticated users to /login)
 */
export const HomeRedirect: React.FC = () => {
  const { isCRUser, isCRAdmin, isAdmin, isSuperuser, isHR, isTeamLeader } = usePermissions();

  if (isCRUser) {
    return <Navigate to="/control-room/dashboard" replace />;
  }

  // CR-only admin uses the same app shell as a normal CR user. The
  // Control Room sidebar exposes both dashboard and access management.
  if (isCRAdmin && !isAdmin && !isSuperuser && !isHR && !isTeamLeader) {
    return <Navigate to="/control-room/dashboard" replace />;
  }

  return <Navigate to="/dashboard" replace />;
};
