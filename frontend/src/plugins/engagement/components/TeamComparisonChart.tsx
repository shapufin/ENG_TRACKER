import React from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";
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
    raw_score: row.engagement_score,
    engagement_score: row.engagement_score ?? 0,
    score_label: row.engagement_score !== null ? `${Math.round(row.engagement_score)}` : "No data",
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
    <ChartContainer config={config} className="aspect-auto h-[280px] w-full">
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 56, left: 8, bottom: 0 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 6" opacity={0.4} />
        <XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="team_name" tickLine={false} axisLine={false} width={100} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              hideLabel
              formatter={(_val, _name, item) => {
                const raw = (item?.payload as { raw_score?: number | null } | undefined)?.raw_score;
                return raw === null || raw === undefined ? "No data" : `${raw.toFixed(1)} / 100`;
              }}
            />
          }
        />
        <Bar dataKey="engagement_score" radius={[2, 6, 6, 2]} maxBarSize={28}>
          {data.map((row) => (
            <Cell
              key={row.team_name}
              fill={row.raw_score === null ? "transparent" : "var(--color-engagement_score)"}
            />
          ))}
          <LabelList
            dataKey="score_label"
            position="right"
            className="fill-muted-foreground font-mono text-xs"
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
};
