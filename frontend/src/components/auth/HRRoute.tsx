import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { usePermissions } from "@/context/PermissionContext";

export const HRRoute: React.FC = () => {
  const { isHR, isAdmin, isSuperuser } = usePermissions();

  if (!isHR && !isAdmin && !isSuperuser) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};
