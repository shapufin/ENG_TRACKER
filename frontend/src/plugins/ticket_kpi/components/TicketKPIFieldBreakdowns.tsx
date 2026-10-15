import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Layers } from "lucide-react";

interface FieldBreakdowns {
  [field: string]: { [value: string]: number };
}

interface TicketKPIFieldBreakdownsProps {
  breakdowns: FieldBreakdowns;
}

export const TicketKPIFieldBreakdowns: React.FC<TicketKPIFieldBreakdownsProps> = ({
  breakdowns,
}) => {
  if (Object.keys(breakdowns).length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
        <Layers className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Detected Fields</h3>
        <p className="text-xs text-muted-foreground">
          Additional categorical fields discovered in this month's uploads.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(breakdowns).map(([fieldName, values]) => {
          const entries = Object.entries(values).sort((a, b) => b[1] - a[1]);
          const total = entries.reduce((sum, [, count]) => sum + count, 0);
          return (
            <Card key={fieldName}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium capitalize">
                  {fieldName.replace(/_/g, " ")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {entries.slice(0, 6).map(([value, count]) => (
                  <div key={value} className="flex items-center justify-between text-sm">
                    <span className="truncate text-foreground">{value}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
                    </div>
                  </div>
                ))}
                {entries.length > 6 && (
                  <p className="text-xs text-muted-foreground">+{entries.length - 6} more values</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
