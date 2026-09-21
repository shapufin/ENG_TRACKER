/** Sidebar item for the TL Engagement Metrics plugin (app layout, TL only). */
import React from "react";
import { useLocation } from "react-router-dom";
import { Gauge } from "lucide-react";
import { SidebarNavLink } from "@/components/layout/SidebarNavLink";
import { usePermissions } from "@/context/PermissionContext";

const EngagementSidebarLink: React.FC = () => {
  const location = useLocation();
  const { isTeamLeader } = usePermissions();
  const isActive = location.pathname === "/engagement/metrics";

  if (!isTeamLeader) return null;

  return (
    <SidebarNavLink
      to="/engagement/metrics"
      label="My Engagement"
      icon={Gauge}
      isActive={isActive}
    />
  );
};

export default EngagementSidebarLink;
