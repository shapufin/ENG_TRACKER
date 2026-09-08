import React from "react";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { RoleSwitcher, RoleBadges } from "@/components/dashboard/RoleSwitcher";
import type { DashboardType } from "@/context/permission-context-base";

interface DashboardPageHeaderProps {
  availableDashboards: DashboardType[];
  currentDashboard: DashboardType;
  onDashboardChange: (dashboard: DashboardType) => void;
  isTeamLeader: boolean;
  isHR: boolean;
  isAdmin: boolean;
  isSuperuser: boolean;
  showSettings?: boolean;
}

export const DashboardPageHeader: React.FC<DashboardPageHeaderProps> = ({
  availableDashboards,
  currentDashboard,
  onDashboardChange,
  isTeamLeader,
  isHR,
  isAdmin,
  isSuperuser,
  showSettings = false,
}) => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <RoleSwitcher
        availableDashboards={availableDashboards}
        currentDashboard={currentDashboard}
        onDashboardChange={onDashboardChange}
      />
      <RoleBadges
        isTeamLeader={isTeamLeader}
        isHR={isHR}
        isAdmin={isAdmin}
        isSuperuser={isSuperuser}
      />
      {showSettings && (
        <Button variant="outline" size="icon" onClick={() => navigate("/settings")}>
          <Settings className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};
