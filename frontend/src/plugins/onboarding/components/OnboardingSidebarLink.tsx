/** Sidebar item for the Onboarding plugin (app layout, employee/TL only,
 * requires at least one assigned client). */
import React from "react";
import { useLocation } from "react-router-dom";
import { FolderKanban } from "lucide-react";
import { SidebarNavLink } from "@/components/layout/SidebarNavLink";
import { usePermissions } from "@/context/PermissionContext";
import { useAuth } from "@/hooks/useAuth";

const OnboardingSidebarLink: React.FC = () => {
  const location = useLocation();
  const { isEmployee, isTeamLeader, isAdmin } = usePermissions();
  const { user } = useAuth();
  const isActive = location.pathname === "/onboarding";
  const hasAssignedClient = (user?.client_ids?.length ?? 0) > 0;

  if (!(isEmployee || isTeamLeader || isAdmin) || !hasAssignedClient) return null;

  return (
    <SidebarNavLink
      to="/onboarding"
      label="Onboarding"
      icon={FolderKanban}
      isActive={isActive}
    />
  );
};

export default OnboardingSidebarLink;
