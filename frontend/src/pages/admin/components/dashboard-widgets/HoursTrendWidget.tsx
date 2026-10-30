import React, { useState } from "react";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HoursOverviewBody } from "./HoursOverviewBody";
import { OtStandbyTrendBody } from "./OtStandbyTrendBody";
import { WidgetBody } from "./WidgetBody";
import { TrendPeriodSelect } from "./TrendPeriodSelect";
import type { TrendPeriod, TrendWidgetProps } from "./trendTypes";

interface HoursTrendWidgetProps extends TrendWidgetProps {
  period: TrendPeriod;
  onPeriodChange: (next: TrendPeriod) => void;
}

/** This month's hours (latest trends point) and the monthly trend in one card; the period applies to the trend. */
export const HoursTrendWidget: React.FC<HoursTrendWidgetProps> = ({
  period,
  onPeriodChange,
  ...trend
}) => {
  const [tab, setTab] = useState("month");
  // The last point of each series is the current business month.
  const latest = (series?: number[]) => series?.[series.length - 1] ?? 0;
  const hoursData = [
    { label: "Overtime", hours: latest(trend.data?.hours.overtime) },
    { label: "Standby", hours: latest(trend.data?.hours.standby) },
  ];
  return (
    <Tabs value={tab} onValueChange={setTab} className="h-full">
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
        <TabsContent value="month" className="mt-0 h-full">
          <WidgetBody
            title="Hours"
            isLoading={trend.isLoading}
            isError={trend.isError}
            onRetry={trend.onRetry}
            empty={null}
          >
            <HoursOverviewBody hoursData={hoursData} />
          </WidgetBody>
        </TabsContent>
        <TabsContent value="trend" className="mt-0 h-full">
          <OtStandbyTrendBody {...trend} />
        </TabsContent>
      </ChartCard>
    </Tabs>
  );
};
