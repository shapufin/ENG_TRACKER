import React from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/ui/EmptyState";
import { Users } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/visualization/chart";
import type { EngagementTeamBreakdownRow } from "../types/engagement";

interface TeamComparisonChartProps {
  rows: EngagementTeamBreakdownRow[];
}

const config: ChartConfig = {
  engagement_score: { label: "Engagement Score", color: "hsl(var(--chart-1))" },
};

/** Per-team engagement score, side by side. Only meaningful with 2+ teams —
 * that threshold lives here (not in the caller) so there's one source of
 * truth for "is a comparison useful," sourced from the same `rows` the
 * chart renders instead of a separate summary field that could momentarily
 * disagree with it during a refetch. */
export const TeamComparisonChart: React.FC<TeamComparisonChartProps> = ({ rows }) => {
  const data = rows.map((row) => ({
    team_name: row.team_name,
    engagement_score: row.engagement_score ?? 0,
  }));

  if (data.length < 2) {
    return (
      <EmptyState
        icon={Users}
        title="No team data yet"
        description="Team comparison appears once snapshots exist for more than one team."
      />
    );
  }

  return (
    <ChartContainer config={config} className="max-h-[280px] w-full">
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 6" opacity={0.4} />
        <XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey="team_name"
          tickLine={false}
          axisLine={false}
          width={100}
        />
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Bar
          dataKey="engagement_score"
          fill="var(--color-engagement_score)"
          radius={[2, 6, 6, 2]}
          maxBarSize={28}
        />
      </BarChart>
    </ChartContainer>
  );
};
