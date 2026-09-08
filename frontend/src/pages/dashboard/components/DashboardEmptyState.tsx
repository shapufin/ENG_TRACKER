import React from "react";
import { PageShell } from "@/components/layout/PageShell";
import { DashboardPageHeader } from "./DashboardPageHeader";
import type { DashboardType } from "@/context/permission-context-base";

interface DashboardEmptyStateProps {
  availableDashboards: DashboardType[];
  selectedDashboard: DashboardType;
  onDashboardChange: (dashboard: DashboardType) => void;
  isTeamLeader: boolean;
  isHR: boolean;
  isAdmin: boolean;
  isSuperuser: boolean;
}

export const DashboardEmptyState: React.FC<DashboardEmptyStateProps> = ({
  availableDashboards,
  selectedDashboard,
  onDashboardChange,
  isTeamLeader,
  isHR,
  isAdmin,
  isSuperuser,
}) => (
  <PageShell title="Dashboard">
    <div className="p-8 text-center">
      <h1 className="text-2xl font-bold text-foreground">Select Dashboard</h1>
      <p className="mt-4 text-muted-foreground">
        Please select a dashboard role from the switcher in the header.
      </p>
      <div className="mt-6 flex justify-center">
        <DashboardPageHeader
          availableDashboards={availableDashboards}
          currentDashboard={selectedDashboard}
          onDashboardChange={onDashboardChange}
          isTeamLeader={isTeamLeader}
          isHR={isHR}
          isAdmin={isAdmin}
          isSuperuser={isSuperuser}
        />
      </div>
    </div>
  </PageShell>
);
