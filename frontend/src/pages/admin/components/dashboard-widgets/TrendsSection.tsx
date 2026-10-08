import React from "react";
import { TRENDS_WIDGET_IDS } from "@/config/dashboardWidgets";
import { useAdminTrends } from "@/hooks/useAdminDashboardQueries";
import { LeaveTrendWidget } from "./LeaveTrendWidget";
import { OtByClientWidget } from "./OtByClientWidget";
import { OtStandbyTrendWidget } from "./OtStandbyTrendWidget";
import { TeamComparisonWidget } from "./TeamComparisonWidget";
import { WhoIsOutWidget } from "./WhoIsOutWidget";

interface TrendsSectionProps {
  isWidgetActive: (id: string) => boolean;
}

const Fetching: React.FC<TrendsSectionProps> = ({ isWidgetActive }) => {
  const q = useAdminTrends(true);
  const props = {
    data: q.data,
    isLoading: q.isLoading,
    isError: q.isError,
    onRetry: () => void q.refetch(),
  };
  return (
    <div className="grid gap-4 lg:grid-cols-4">
      {isWidgetActive("ot-standby-trend") && <OtStandbyTrendWidget {...props} />}
      {isWidgetActive("leave-trend") && <LeaveTrendWidget {...props} />}
      {isWidgetActive("ot-by-client") && <OtByClientWidget {...props} />}
      {isWidgetActive("who-is-out") && <WhoIsOutWidget {...props} />}
      {isWidgetActive("team-comparison") && <TeamComparisonWidget {...props} />}
    </div>
  );
};

/** Mounts the single admin_trends request only while a trends widget is on. */
export const TrendsSection: React.FC<TrendsSectionProps> = (props) =>
  TRENDS_WIDGET_IDS.some((id) => props.isWidgetActive(id)) ? <Fetching {...props} /> : null;
