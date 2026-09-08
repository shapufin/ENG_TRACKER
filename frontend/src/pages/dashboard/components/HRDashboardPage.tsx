import React from "react";
import { PageShell } from "@/components/layout/PageShell";
import { HRDashboardView } from "../HRDashboardView";
import { DashboardPageHeader } from "./DashboardPageHeader";
import type { DashboardType } from "@/context/permission-context-base";

interface HRDashboardPageProps {
  availableDashboards: DashboardType[];
  selectedDashboard: DashboardType;
  onDashboardChange: (dashboard: DashboardType) => void;
  isTeamLeader: boolean;
  isHR: boolean;
  isAdmin: boolean;
  isSuperuser: boolean;
  viewProps: React.ComponentProps<typeof HRDashboardView>;
}

export const HRDashboardPage: React.FC<HRDashboardPageProps> = ({
  availableDashboards,
  selectedDashboard,
  onDashboardChange,
  isTeamLeader,
  isHR,
  isAdmin,
  isSuperuser,
  viewProps,
}) => (
  <PageShell
    title="Dashboard"
    subtitle="HR overview and company-wide metrics."
    actions={
      <DashboardPageHeader
        availableDashboards={availableDashboards}
        currentDashboard={selectedDashboard}
        onDashboardChange={onDashboardChange}
        isTeamLeader={isTeamLeader}
        isHR={isHR}
        isAdmin={isAdmin}
        isSuperuser={isSuperuser}
      />
    }
  >
    <div className="space-y-6">
      <HRDashboardView {...viewProps} />
    </div>
  </PageShell>
);
