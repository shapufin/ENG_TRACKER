import React from "react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/GlassCard";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Badge } from "@/components/ui/badge";

interface AggregateCardProps {
  title: string;
  description: string;
  color: "blue" | "purple";
  icon: React.ReactNode;
  total_hours: number;
  approved_hours: number;
  total_entries: number;
  pending_count: number;
  totalLabel: string;
  approvedLabel: string;
  pendingLabel: string;
}

const colorClasses = {
  blue: {
    border: "border-t-primary",
    header: "bg-primary/5",
    title: "text-primary",
  },
  purple: {
    border: "border-t-accent",
    header: "bg-accent/20",
    title: "text-accent-foreground",
  },
};

export const AggregateCard: React.FC<AggregateCardProps> = ({
  title,
  description,
  color,
  icon,
  total_hours,
  approved_hours,
  total_entries,
  pending_count,
  totalLabel,
  approvedLabel,
  pendingLabel,
}) => {
  const colors = colorClasses[color];
  return (
    <GlassCard className={`overflow-hidden border-t-4 ${colors.border} p-0`}>
      <CardHeader className={`${colors.header} pb-4`}>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className={`text-base ${colors.title}`}>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {icon}
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <div className="grid grid-cols-2 gap-8">
          <div className="space-y-1">
            <p className="text-3xl font-bold tabular-nums tracking-tighter">
              <AnimatedNumber value={total_hours} />
            </p>
            <p className="text-xs font-medium uppercase text-muted-foreground">{totalLabel}</p>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold tabular-nums tracking-tighter text-success">
              <AnimatedNumber value={approved_hours} />
            </p>
            <p className="text-xs font-medium uppercase text-muted-foreground">{approvedLabel}</p>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-between border-t pt-6">
          <Badge variant="outline" className="font-mono">
            <span className="tabular-nums">{total_entries}</span> logs
          </Badge>
          <span className="rounded-full bg-warning/10 px-2 py-1 text-xs font-semibold text-warning">
            <span className="tabular-nums">{pending_count}</span> {pendingLabel}
          </span>
        </div>
      </CardContent>
    </GlassCard>
  );
};
