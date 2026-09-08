/** Sidebar item for the Organigrama plugin (app layout). */
import React from "react";
import { useLocation } from "react-router-dom";
import { Network } from "lucide-react";
import { SidebarNavLink } from "@/components/layout/SidebarNavLink";
import { usePermissions } from "@/context/PermissionContext";

const OrganigramaSidebarItem: React.FC = () => {
  const location = useLocation();
  const { isCRUser, isCRAdmin, isAdmin, isSuperuser, isHR, isTeamLeader } = usePermissions();
  const isCROnlyAdmin = isCRAdmin && !isAdmin && !isSuperuser && !isHR && !isTeamLeader;
  const isCRScoped = isCRUser || isCROnlyAdmin;
  const isActive = location.pathname === "/organigrama";

  if (isCRScoped) return null;

  return (
    <SidebarNavLink to="/organigrama" label="Organigrama" icon={Network} isActive={isActive} />
  );
};

export default OrganigramaSidebarItem;
