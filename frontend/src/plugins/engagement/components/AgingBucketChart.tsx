import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { BarChart3 } from "lucide-react";
import type { EngagementTeamBreakdownRow } from "../types/engagement";

interface AgingBucketChartProps {
  rows: EngagementTeamBreakdownRow[];
}

const BUCKET_ORDER = ["<4h", "4-24h", "1-3d", ">3d"] as const;
const REQUEST_TYPES = ["leave", "overtime", "standby"] as const;

export const AgingBucketChart: React.FC<AgingBucketChartProps> = ({ rows }) => {
  const data = useMemo(() => {
    const totals: Record<string, number> = { "<4h": 0, "4-24h": 0, "1-3d": 0, ">3d": 0 };
    for (const row of rows) {
      for (const type of REQUEST_TYPES) {
        const aging = row.metrics[type]?.aging;
        if (!aging) continue;
        for (const bucket of BUCKET_ORDER) {
          totals[bucket] += aging[bucket] ?? 0;
        }
      }
    }
    return BUCKET_ORDER.map((bucket) => ({ bucket, count: totals[bucket] }));
  }, [rows]);

  const hasData = data.some((d) => d.count > 0);

  return (
    <ChartCard title="Approval Aging" description="Decided requests by time-to-approve">
      {!hasData ? (
        <EmptyState
          icon={BarChart3}
          title="No decided requests yet"
          description="Aging buckets appear once requests have been approved or rejected."
        />
      ) : (
        <div className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="bucket"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  borderColor: "hsl(var(--border))",
                  color: "hsl(var(--popover-foreground))",
                  borderRadius: "8px",
                }}
              />
              <Bar
                dataKey="count"
                name="Requests"
                fill="hsl(var(--chart-3))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
};
