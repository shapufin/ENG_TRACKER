import React from "react";
import { TRENDS_WIDGET_IDS } from "@/config/dashboardWidgets";
import { useAdminTrends } from "@/hooks/useAdminDashboardQueries";
import { useUrlParamState } from "@/hooks/useUrlParamState";
import { TREND_PERIODS } from "./trendTypes";
import { LeaveTrendWidget } from "./LeaveTrendWidget";
import { OtByClientWidget } from "./OtByClientWidget";
import { HoursTrendWidget } from "./HoursTrendWidget";
import { TeamComparisonWidget } from "./TeamComparisonWidget";
import { WhoIsOutWidget } from "./WhoIsOutWidget";

interface TrendsSectionProps {
  isWidgetActive: (id: string) => boolean;
  /** This month's overtime / standby hours (stats data) for the Hours widget. */
  hoursData?: { label: string; hours: number }[];
  statsLoading?: boolean;
}

const Fetching: React.FC<TrendsSectionProps> = ({
  isWidgetActive,
  hoursData = [],
  statsLoading,
}) => {
  const [period, setPeriod] = useUrlParamState("months", TREND_PERIODS, "12");
  const q = useAdminTrends(true, Number(period));
  const props = {
    data: q.data,
    isLoading: q.isLoading,
    isError: q.isError,
    onRetry: () => void q.refetch(),
  };
  return (
    <>
      {isWidgetActive("hours-trend") && (
        <HoursTrendWidget
          {...props}
          hoursData={hoursData}
          statsLoading={statsLoading}
          period={period}
          onPeriodChange={setPeriod}
        />
      )}
      {isWidgetActive("leave-trend") && <LeaveTrendWidget {...props} />}
      {isWidgetActive("ot-by-client") && <OtByClientWidget {...props} />}
      {isWidgetActive("who-is-out") && <WhoIsOutWidget {...props} />}
      {isWidgetActive("team-comparison") && <TeamComparisonWidget {...props} />}
    </>
  );
};

/** Mounts the single admin_trends request only while a trends widget is on. */
export const TrendsSection: React.FC<TrendsSectionProps> = (props) =>
  TRENDS_WIDGET_IDS.some((id) => props.isWidgetActive(id)) ? <Fetching {...props} /> : null;
