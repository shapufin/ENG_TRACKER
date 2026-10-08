import React from "react";
import { OVERVIEW_WIDGET_IDS } from "@/config/dashboardWidgets";
import { useAdminOverview } from "@/hooks/useAdminDashboardQueries";
import { OverviewWidgets, type OverviewStats } from "./OverviewWidgets";

interface OverviewSectionProps {
  isWidgetActive: (id: string) => boolean;
  isSuperuser: boolean;
  stats: OverviewStats;
}

const Fetching: React.FC<OverviewSectionProps> = (props) => {
  const overview = useAdminOverview(true);
  return (
    <OverviewWidgets
      {...props}
      data={overview.data}
      isLoading={overview.isLoading}
      isError={overview.isError}
      onRetry={() => void overview.refetch()}
    />
  );
};

/** Mounts the single overview request only while an overview widget is on. */
export const OverviewSection: React.FC<OverviewSectionProps> = (props) => {
  const anyActive = OVERVIEW_WIDGET_IDS.some(
    (id) => props.isWidgetActive(id) && (id !== "backup-status" || props.isSuperuser)
  );
  return anyActive ? <Fetching {...props} /> : null;
};
