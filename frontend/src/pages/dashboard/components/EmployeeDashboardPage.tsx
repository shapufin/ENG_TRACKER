import React from "react";
import { PageShell } from "@/components/layout/PageShell";
import { PersonalDashboardView } from "../PersonalDashboardView";
import { DashboardPageHeader } from "./DashboardPageHeader";
import type { User } from "@/types";
import type { DashboardType } from "@/context/permission-context-base";

interface EmployeeDashboardPageProps {
  user: User | null;
  availableDashboards: DashboardType[];
  selectedDashboard: DashboardType;
  onDashboardChange: (dashboard: DashboardType) => void;
  isTeamLeader: boolean;
  isHR: boolean;
  isAdmin: boolean;
  isSuperuser: boolean;
  viewProps: React.ComponentProps<typeof PersonalDashboardView>;
}

export const EmployeeDashboardPage: React.FC<EmployeeDashboardPageProps> = ({
  user,
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
    subtitle={`Welcome back, ${user?.first_name || user?.username || "Employee"}`}
    actions={
      <DashboardPageHeader
        availableDashboards={availableDashboards}
        currentDashboard={selectedDashboard}
        onDashboardChange={onDashboardChange}
        isTeamLeader={isTeamLeader}
        isHR={isHR}
        isAdmin={isAdmin}
        isSuperuser={isSuperuser}
        showSettings
      />
    }
  >
    <div className="space-y-6">
      <PersonalDashboardView {...viewProps} />
    </div>
  </PageShell>
);
