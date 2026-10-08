import React from "react";
import { cn } from "@/lib/utils";
import { toneSurfaceClass } from "@/components/ui/tone";
import { WidgetFrame } from "./WidgetFrame";
import type { PeopleWidgetProps } from "./trendTypes";

export const RoleDistributionWidget: React.FC<PeopleWidgetProps> = ({
  data,
  isLoading,
  isError,
  onRetry,
}) => {
  const r = data?.roles;
  const rows: [string, number, boolean][] = r
    ? [
        ["Italian TLs", r.italian_tl, false],
        ["Albanian TLs", r.albanian_tl, false],
        ["HR", r.hr, false],
        ["HBPR", r.hbpr, false],
        ["Staff", r.staff, false],
        ["Employees", r.employees, false],
        ["Employees without a TL", r.employees_without_tl, r.employees_without_tl > 0],
      ]
    : [];
  return (
    <WidgetFrame
      title="Role Distribution"
      description="Active users by role; a person can hold several"
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      empty={null}
    >
      <ul className="space-y-1.5 text-xs">
        {rows.map(([label, n, warn]) => (
          <li
            key={label}
            className={cn(
              "flex items-center justify-between gap-2 rounded-md border border-transparent px-2 py-1",
              warn && toneSurfaceClass.warning
            )}
          >
            <span className={warn ? undefined : "text-muted-foreground"}>{label}</span>
            <span className="font-mono font-semibold tabular-nums">{n}</span>
          </li>
        ))}
      </ul>
    </WidgetFrame>
  );
};
