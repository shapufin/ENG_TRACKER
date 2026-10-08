import React from "react";
import { TRENDS_WIDGET_IDS } from "@/config/dashboardWidgets";
import { useAdminTrends } from "@/hooks/useAdminDashboardQueries";
import { useUrlParamState } from "@/hooks/useUrlParamState";
import { TrendPeriodSelect } from "./TrendPeriodSelect";
import { TREND_PERIODS } from "./trendTypes";
import { LeaveTrendWidget } from "./LeaveTrendWidget";
import { OtByClientWidget } from "./OtByClientWidget";
import { HoursTrendWidget } from "./HoursTrendWidget";
import { GridCell } from "../dashboard-grid/GridCell";
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
      {!isWidgetActive("hours-trend") && (
        // The period also drives the other trend charts; without the Hours widget it sits alone.
        <div className="flex justify-end md:col-span-6 lg:col-span-12">
          <TrendPeriodSelect value={period} onChange={setPeriod} />
        </div>
      )}
      {isWidgetActive("hours-trend") && (
        <GridCell id="hours-trend">
          <HoursTrendWidget
            {...props}
            hoursData={hoursData}
            statsLoading={statsLoading}
            period={period}
            onPeriodChange={setPeriod}
          />
        </GridCell>
      )}
      {isWidgetActive("leave-trend") && (
        <GridCell id="leave-trend">
          <LeaveTrendWidget {...props} />
        </GridCell>
      )}
      {isWidgetActive("ot-by-client") && (
        <GridCell id="ot-by-client">
          <OtByClientWidget {...props} />
        </GridCell>
      )}
      {isWidgetActive("who-is-out") && (
        <GridCell id="who-is-out">
          <WhoIsOutWidget {...props} />
        </GridCell>
      )}
      {isWidgetActive("team-comparison") && (
        <GridCell id="team-comparison">
          <TeamComparisonWidget {...props} />
        </GridCell>
      )}
    </>
  );
};

/** Mounts the single admin_trends request only while a trends widget is on. */
export const TrendsSection: React.FC<TrendsSectionProps> = (props) =>
  TRENDS_WIDGET_IDS.some((id) => props.isWidgetActive(id)) ? <Fetching {...props} /> : null;
