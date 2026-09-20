import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardSwitcher } from "@/components/dashboard/DashboardSwitcher";
import { RoleBadges } from "@/components/dashboard/RoleSwitcher";
import type { DashboardType } from "@/context/permission-context-base";

interface TeamLeaderDashboardHeaderProps {
  availableDashboards: DashboardType[];
  selectedDashboard: DashboardType;
  onDashboardChange: (dashboard: DashboardType) => void;
  isTeamLeader: boolean;
  isHR: boolean;
  isAdmin: boolean;
  isSuperuser: boolean;
  pendingApprovalCount?: number;
}

export const TeamLeaderDashboardHeader: React.FC<TeamLeaderDashboardHeaderProps> = ({
  availableDashboards,
  selectedDashboard,
  onDashboardChange,
  isTeamLeader,
  isHR,
  isAdmin,
  isSuperuser,
  pendingApprovalCount,
}) => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <DashboardSwitcher
        availableDashboards={availableDashboards}
        selectedDashboard={selectedDashboard}
        onDashboardChange={onDashboardChange}
        showWorkspaceTab
      />
      {/* The switcher already communicates HR/TL/Admin placement — badges
          only add signal for superuser, which has no switcher segment. */}
      {isSuperuser && (
        <RoleBadges
          isTeamLeader={isTeamLeader}
          isHR={isHR}
          isAdmin={isAdmin}
          isSuperuser={isSuperuser}
        />
      )}
      <Button onClick={() => navigate("/team/approvals")}>
        Open Approval Queue
        {!!pendingApprovalCount && (
          <Badge className="ml-2 rounded-full bg-background/20 px-2 text-primary-foreground hover:bg-background/20">
            {pendingApprovalCount}
          </Badge>
        )}
      </Button>
    </div>
  );
};
