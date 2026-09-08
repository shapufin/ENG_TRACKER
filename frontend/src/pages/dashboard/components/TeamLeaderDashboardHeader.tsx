import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RoleSwitcher, RoleBadges } from "@/components/dashboard/RoleSwitcher";
import type { DashboardType } from "@/context/permission-context-base";

interface TeamLeaderDashboardHeaderProps {
  availableDashboards: DashboardType[];
  selectedDashboard: DashboardType;
  onDashboardChange: (dashboard: DashboardType) => void;
  isTeamLeader: boolean;
  isHR: boolean;
  isAdmin: boolean;
  isSuperuser: boolean;
}

export const TeamLeaderDashboardHeader: React.FC<TeamLeaderDashboardHeaderProps> = ({
  availableDashboards,
  selectedDashboard,
  onDashboardChange,
  isTeamLeader,
  isHR,
  isAdmin,
  isSuperuser,
}) => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-subtle pb-3">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Approval Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Monitor pending approvals, bottlenecks and request activity.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <RoleSwitcher
          availableDashboards={availableDashboards}
          currentDashboard={selectedDashboard}
          onDashboardChange={onDashboardChange}
        />
        <RoleBadges
          isTeamLeader={isTeamLeader}
          isHR={isHR}
          isAdmin={isAdmin}
          isSuperuser={isSuperuser}
        />
        <Badge
          className="h-9 cursor-pointer rounded-full border border-primary/20 bg-primary/10 px-4 text-foreground hover:bg-primary/10"
          onClick={() => navigate("/team")}
        >
          Team Workspace
        </Badge>
        <Button onClick={() => navigate("/team/approvals")}>Open Approval Queue</Button>
      </div>
    </div>
  );
};
