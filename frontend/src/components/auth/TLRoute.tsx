import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { usePermissions } from "@/context/PermissionContext";

export const TLRoute: React.FC = () => {
  const { isTeamLeader, isAdmin, isSuperuser } = usePermissions();

  if (!isTeamLeader && !isAdmin && !isSuperuser) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};
