import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { usePermissions } from "@/context/PermissionContext";

/**
 * Wraps routes an HBPR-only user must not reach — Calendar and Leave.
 *
 * The API refuses them too (`HbprBlockedMixin`), so this is presentation only;
 * it exists so an HBPR never lands on an empty, erroring page. A multi-role
 * HBPR+HR/TL/admin keeps the other role's access and passes straight through.
 */
export const HbprRestrictedRoute: React.FC = () => {
  const { isHBPROnly } = usePermissions();

  if (isHBPROnly) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};
