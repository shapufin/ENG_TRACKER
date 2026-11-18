import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { rankBreakdown } from "../utils/rankBreakdown";

interface RankedBarsProps {
  title: string;
  data: Record<string, number>;
  /** Chart token index (1-5) for the bar fill. */
  tone: 1 | 2 | 3 | 4 | 5;
  emptyText: string;
  limit?: number;
}

/**
 * A ranked list of horizontal bars: label, count and share on one line, the
 * bar underneath. Replaces the pie, whose legend and repeating colours stop
 * working past five categories. Every value is also plain text, so the chart
 * never depends on colour or a hover tooltip.
 */
export const RankedBars: React.FC<RankedBarsProps> = ({
  title,
  data,
  tone,
  emptyText,
  limit = 8,
}) => {
  const rows = rankBreakdown(data, limit);
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{emptyText}</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.label}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span
                    className={
                      row.folded ? "text-muted-foreground truncate" : "text-foreground truncate"
                    }
                    title={row.label}
                  >
                    {row.label}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    <span className="text-foreground font-medium">{row.count}</span> · {row.percent}
                    %
                  </span>
                </div>
                <div
                  className="bg-muted mt-1 h-1.5 overflow-hidden rounded-full"
                  aria-hidden="true"
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${max > 0 ? (row.count / max) * 100 : 0}%`,
                      backgroundColor: `hsl(var(--chart-${tone}))`,
                      opacity: row.folded ? 0.5 : 1,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
