/** Sidebar item for the HBPR governance workspace (app layout, HBPR only). */
import React from "react";
import { useLocation } from "react-router-dom";
import { Handshake } from "lucide-react";
import { SidebarNavLink } from "@/components/layout/SidebarNavLink";
import { usePermissions } from "@/context/PermissionContext";

const HbprSidebarLink: React.FC = () => {
  const location = useLocation();
  const { isHBPR } = usePermissions();

  if (!isHBPR) return null;

  return (
    <SidebarNavLink
      to="/hbpr"
      label="HBPR Workspace"
      icon={Handshake}
      isActive={location.pathname === "/hbpr"}
    />
  );
};

export default HbprSidebarLink;
