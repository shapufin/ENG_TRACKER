import React, { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { PermissionContext } from "./permission-context-base";
import { computePermissions } from "./computePermissions";

export const PermissionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const value = useMemo(() => computePermissions(user), [user]);

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export { usePermissions } from "@/hooks/usePermissions";
