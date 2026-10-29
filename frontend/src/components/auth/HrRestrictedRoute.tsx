import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { usePermissions } from "@/context/PermissionContext";

/**
 * Wraps routes a pure-HR user must not reach — the team Calendar. HR has no
 * team workspaces (company holidays live at `/hr/calendars`), so the page is
 * empty for them. HR who is also a TL or admin is not `isHROnly` and passes.
 */
export const HrRestrictedRoute: React.FC = () => {
  const { isHROnly } = usePermissions();

  if (isHROnly) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};
