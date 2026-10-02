import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { usePermissions } from "@/context/PermissionContext";

/** Overtime and standby are not part of an HBPR's work (the API refuses them),
 * so an HBPR-only user is sent home instead of landing on an empty page. */
export const HoursRoute: React.FC = () => {
  const { isHBPROnly } = usePermissions();

  if (isHBPROnly) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};
