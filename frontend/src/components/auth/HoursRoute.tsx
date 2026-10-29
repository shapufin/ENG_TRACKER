import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { usePermissions } from "@/context/PermissionContext";

/** Overtime and standby are not part of an HBPR's work (the API refuses them),
 * nor of a pure-HR user's (no personal hours; HR who is also a TL or admin is
 * not `isHROnly`), so both are sent home instead of landing on an empty page. */
export const HoursRoute: React.FC = () => {
  const { isHBPROnly, isHROnly } = usePermissions();

  if (isHBPROnly || isHROnly) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};
