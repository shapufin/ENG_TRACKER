import React from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DASHBOARD_SEGMENT_LABEL, WORKSPACE_TAB } from "./dashboardSegments";
import type { DashboardType } from "@/context/permission-context-base";

interface DashboardSwitcherProps {
  availableDashboards: DashboardType[];
  selectedDashboard: DashboardType;
  onDashboardChange: (dashboard: DashboardType) => void;
  /** Adds a "Team Workspace" segment that navigates to /team. TL dashboards pass true. */
  showWorkspaceTab?: boolean;
}

/**
 * Shared dashboard switcher — the single header element used by every
 * dashboard template. Renders nothing for single-dashboard users.
 */
export const DashboardSwitcher: React.FC<DashboardSwitcherProps> = ({
  availableDashboards,
  selectedDashboard,
  onDashboardChange,
  showWorkspaceTab = false,
}) => {
  const navigate = useNavigate();

  if (availableDashboards.length <= 1 && !showWorkspaceTab) {
    return null;
  }

  return (
    <Tabs
      value={selectedDashboard}
      onValueChange={(value) => {
        if (value === WORKSPACE_TAB) {
          navigate("/team");
        } else {
          onDashboardChange(value as DashboardType);
        }
      }}
      aria-label="Switch dashboard"
    >
      <TabsList className="h-auto max-w-full flex-wrap">
        {availableDashboards.map((dashboard) => (
          <TabsTrigger key={dashboard} value={dashboard}>
            {DASHBOARD_SEGMENT_LABEL[dashboard]}
          </TabsTrigger>
        ))}
        {showWorkspaceTab && <TabsTrigger value={WORKSPACE_TAB}>Team Workspace</TabsTrigger>}
      </TabsList>
    </Tabs>
  );
};
