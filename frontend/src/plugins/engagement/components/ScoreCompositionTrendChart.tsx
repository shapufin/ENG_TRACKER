import React from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/ui/EmptyState";
import { LineChart as LineChartIcon } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/visualization/chart";
import { formatMonthTick } from "@/lib/monthOptions";
import type { EngagementTrendPoint } from "../types/engagement";

interface ScoreCompositionTrendChartProps {
  data: EngagementTrendPoint[];
}

const config: ChartConfig = {
  score_speed: { label: "Speed", color: "hsl(var(--chart-1))" },
  score_approval_rate: { label: "Approval rate", color: "hsl(var(--chart-2))" },
  score_activity: { label: "Activity", color: "hsl(var(--chart-3))" },
  score_consistency: { label: "Consistency", color: "hsl(var(--chart-4))" },
};

/** Which of the 4 composite-score components moved, and since when — the
 * composite trend line alone can't answer that, this breaks it apart. */
export const ScoreCompositionTrendChart: React.FC<ScoreCompositionTrendChartProps> = ({
  data,
}) => {
  const hasData = data.some(
    (d) =>
      d.score_speed !== null ||
      d.score_approval_rate !== null ||
      d.score_activity !== null ||
      d.score_consistency !== null
  );

  if (!hasData) {
    return (
      <EmptyState
        icon={LineChartIcon}
        title="No score history yet"
        description="Score components appear here once monthly snapshots build up."
      />
    );
  }

  return (
    <ChartContainer config={config} className="max-h-[320px] w-full">
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 6" opacity={0.4} />
        <XAxis dataKey="month" tickFormatter={formatMonthTick} tickLine={false} axisLine={false} />
        <YAxis domain={[0, 100]} tickLine={false} axisLine={false} />
        <ChartTooltip
          content={<ChartTooltipContent labelFormatter={(v) => formatMonthTick(String(v))} />}
        />
        <ChartLegend content={<ChartLegendContent />} />
        {Object.entries(config).map(([key, { label }]) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            name={label as string}
            stroke={`var(--color-${key})`}
            strokeWidth={2}
            dot={{ r: 2 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
};
