import React from "react";
import { CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";

export const ChartAxisGrid: React.FC = () => (
  <>
    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
    <XAxis
      dataKey="name"
      axisLine={false}
      tickLine={false}
      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
      dy={10}
    />
    <YAxis
      axisLine={false}
      tickLine={false}
      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
    />
    <Tooltip
      contentStyle={{
        background: "hsl(var(--popover))",
        border: "1px solid hsl(var(--border))",
        borderRadius: "8px",
      }}
    />
  </>
);
