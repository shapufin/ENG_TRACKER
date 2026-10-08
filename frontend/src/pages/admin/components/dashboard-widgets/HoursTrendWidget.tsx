import React, { useState } from "react";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HoursOverviewBody } from "./HoursOverviewBody";
import { OtStandbyTrendBody } from "./OtStandbyTrendBody";
import { TrendPeriodSelect } from "./TrendPeriodSelect";
import type { TrendPeriod, TrendWidgetProps } from "./trendTypes";

interface HoursTrendWidgetProps extends TrendWidgetProps {
  /** This month's overtime / standby hours (stats data). */
  hoursData: { label: string; hours: number }[];
  statsLoading?: boolean;
  period: TrendPeriod;
  onPeriodChange: (next: TrendPeriod) => void;
}

/** This month's hours and the monthly trend in one card; the period applies to the trend. */
export const HoursTrendWidget: React.FC<HoursTrendWidgetProps> = ({
  hoursData,
  statsLoading,
  period,
  onPeriodChange,
  ...trend
}) => {
  const [tab, setTab] = useState("month");
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <ChartCard
        sectionId="hours-trend"
        title="Hours"
        className="h-full"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {tab === "trend" && <TrendPeriodSelect value={period} onChange={onPeriodChange} />}
            <TabsList aria-label="Hours views">
              <TabsTrigger value="month">This month</TabsTrigger>
              <TabsTrigger value="trend">Trend</TabsTrigger>
            </TabsList>
          </div>
        }
      >
        <TabsContent value="month" className="mt-0">
          <HoursOverviewBody hoursData={hoursData} isLoading={statsLoading} />
        </TabsContent>
        <TabsContent value="trend" className="mt-0">
          <OtStandbyTrendBody {...trend} />
        </TabsContent>
      </ChartCard>
    </Tabs>
  );
};
