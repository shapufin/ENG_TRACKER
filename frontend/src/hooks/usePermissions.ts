import { useContext } from "react";
import { PermissionContext } from "@/context/permission-context-base";

export const usePermissions = () => {
  const ctx = useContext(PermissionContext);
  if (!ctx) throw new Error("usePermissions must be used within PermissionProvider");
  return ctx;
};
