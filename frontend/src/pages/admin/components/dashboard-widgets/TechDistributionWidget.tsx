import React from "react";
import { Cpu } from "lucide-react";
import { WidgetFrame } from "./WidgetFrame";
import type { PeopleWidgetProps } from "./trendTypes";

export const TechDistributionWidget: React.FC<PeopleWidgetProps> = ({
  data,
  isLoading,
  isError,
  onRetry,
}) => {
  const techs = data?.techs ?? [];
  return (
    <WidgetFrame
      sectionId="tech-distribution"
      title="Tech Distribution"
      description="Active members per tech and level"
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      empty={techs.length === 0 ? { icon: Cpu, title: "No tech assignments yet" } : null}
    >
      <div className="space-y-3 text-xs">
        {techs.map((t) => (
          <div key={t.tech_id} role="group" aria-label={t.name} className="space-y-1">
            <div className="flex justify-between gap-2">
              <span className="font-medium">{t.name}</span>
              <span className="text-muted-foreground font-mono tabular-nums">{t.count}</span>
            </div>
            <ul className="flex flex-wrap gap-1.5">
              {t.levels.map((lv) => (
                <li
                  key={lv.code ?? "ungraded"}
                  className="border-border bg-muted/50 rounded-md border px-2 py-0.5"
                >
                  {lv.name} <span className="font-mono font-semibold tabular-nums">{lv.count}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </WidgetFrame>
  );
};
