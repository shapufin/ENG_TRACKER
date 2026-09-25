/** Sidebar item for the TL Scorecard plugin (app layout, TL only). */
import React from "react";
import { useLocation } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import { SidebarNavLink } from "@/components/layout/SidebarNavLink";
import { usePermissions } from "@/context/PermissionContext";

const TLScorecardSidebarLink: React.FC = () => {
  const location = useLocation();
  const { isTeamLeader, isAdmin } = usePermissions();
  const isActive = location.pathname === "/tl-scorecard";

  if (!isTeamLeader && !isAdmin) return null;

  return (
    <SidebarNavLink
      to="/tl-scorecard"
      label="TL Scorecard"
      icon={ClipboardList}
      isActive={isActive}
    />
  );
};

export default TLScorecardSidebarLink;
