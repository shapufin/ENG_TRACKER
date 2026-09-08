import React from "react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/GlassCard";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { CalendarDays, TrendingUp } from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { ChartAxisGrid } from "./ChartAxisGrid";

interface VacationReportProps {
  summaryData?: {
    leave?: {
      total_days: number;
      approved_days: number;
      pending_count: number;
      total_requests: number;
    };
  };
  detailedData?: {
    leave?: { month?: string; year?: string; total_days: number }[];
  };
  groupBy: string;
}

export const VacationReport: React.FC<VacationReportProps> = ({
  summaryData,
  detailedData,
  groupBy,
}) => {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-3">
        <GlassCard className="overflow-hidden border-t-4 border-t-success p-0 md:col-span-2">
          <CardHeader className="bg-success/5 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base text-emerald-800 dark:text-emerald-400">
                  Leave Utilization
                </CardTitle>
                <CardDescription>Aggregate vacation and sick leave patterns</CardDescription>
              </div>
              <CalendarDays className="h-5 w-5 text-success" />
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-1">
                <p className="text-4xl font-bold tabular-nums tracking-tighter">
                  <AnimatedNumber value={summaryData?.leave?.total_days || 0} />
                  <span className="ml-1 text-lg text-muted-foreground">Days</span>
                </p>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Total Leave Impact
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-4xl font-bold tabular-nums tracking-tighter text-emerald-700 dark:text-emerald-400">
                  <AnimatedNumber value={summaryData?.leave?.approved_days || 0} />
                  <span className="ml-1 text-lg text-muted-foreground">Days</span>
                </p>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Approved Absence
                </p>
              </div>
            </div>
          </CardContent>
        </GlassCard>

        <GlassCard className="flex flex-col justify-center border-l-4 border-l-warning p-6">
          <div className="space-y-4">
            <div>
              <p className="mb-1 text-sm font-medium text-muted-foreground">Queue Status</p>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
                  {summaryData?.leave?.pending_count || 0}
                </span>
                <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  Pending Requests
                </span>
              </div>
            </div>
            <div className="border-t pt-4">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Total of{" "}
                <span className="font-bold tabular-nums text-foreground">
                  {summaryData?.leave?.total_requests || 0}
                </span>{" "}
                requests submitted within the selected period.
              </p>
            </div>
          </div>
        </GlassCard>
      </div>

      {detailedData && groupBy !== "user" && (
        <GlassCard className="p-6">
          <div className="mb-6 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Absence Trend Analysis</CardTitle>
          </div>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={detailedData.leave?.map((v) => ({
                  name: v.month || v.year,
                  days: v.total_days,
                }))}
              >
                <ChartAxisGrid />
                <Line
                  type="monotone"
                  dataKey="days"
                  name="Leave Days"
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={3}
                  dot={{ fill: "hsl(var(--chart-2))", r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      )}
    </div>
  );
};
