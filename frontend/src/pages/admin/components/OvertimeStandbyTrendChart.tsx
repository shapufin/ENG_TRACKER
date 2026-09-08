import React from "react";
import { CardTitle } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/GlassCard";
import { TrendingUp } from "lucide-react";
import { BarChart, Bar, ResponsiveContainer, Legend } from "recharts";
import { ChartAxisGrid } from "./ChartAxisGrid";

interface OvertimeStandbyTrendChartProps {
  overtime: { month?: string; year?: string; total_hours: number }[];
  standby: { total_hours: number }[];
}

export const OvertimeStandbyTrendChart: React.FC<OvertimeStandbyTrendChartProps> = ({
  overtime,
  standby,
}) => {
  const data =
    overtime?.map((ot, idx) => ({
      name: ot.month || ot.year,
      overtime: ot.total_hours,
      standby: standby?.[idx]?.total_hours || 0,
    })) ?? [];

  return (
    <GlassCard className="p-6">
      <div className="mb-6 flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-primary" />
        <CardTitle className="text-base">Temporal Analysis</CardTitle>
      </div>
      <div className="h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <ChartAxisGrid />
            <Legend verticalAlign="top" align="right" height={36} iconType="circle" />
            <Bar
              dataKey="overtime"
              name="Overtime"
              fill="hsl(var(--chart-1))"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="standby"
              name="Standby"
              fill="hsl(var(--chart-5))"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
};
