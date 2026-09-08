import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/badge";
const COLOR_VIOLET = "hsl(var(--chart-5))";
const COLOR_YELLOW = "hsl(var(--chart-3))";

interface QueueSegment {
  label: string;
  value: number;
  percentage: number;
  accent: string;
}

interface QueueMixCardProps {
  pendingTotal: number;
  pendingStandby: number;
  queueSegments: QueueSegment[];
}

export const QueueMixCard: React.FC<QueueMixCardProps> = ({
  pendingTotal,
  pendingStandby,
  queueSegments,
}) => {
  return (
    <GlassCard>
      <div className="flex flex-row items-start justify-between p-6 pb-0">
        <div>
          <h3 className="text-2xl font-semibold">Queue Mix</h3>
          <p className="mt-1 text-muted-foreground">Request distribution overview</p>
        </div>
        <Badge className="rounded-full border border-primary/20 bg-primary/10 px-3 text-foreground">
          {pendingTotal} pending
        </Badge>
      </div>
      <div className="p-6">
        <div className="flex items-center justify-center py-4">
          <div className="relative flex h-56 w-56 items-center justify-center rounded-full">
            <div
              className="absolute inset-0 rounded-full blur-[1px]"
              style={{
                background: `conic-gradient(
                  ${pendingStandby > 0 ? COLOR_YELLOW : COLOR_VIOLET} 0deg,
                  ${pendingStandby > 0 ? COLOR_YELLOW : COLOR_VIOLET} ${pendingStandby > 0 ? (pendingStandby / pendingTotal) * 360 : 360}deg,
                  ${COLOR_VIOLET} ${pendingStandby > 0 ? (pendingStandby / pendingTotal) * 360 : 0}deg,
                  ${COLOR_VIOLET} 360deg
                )`,
              }}
            />
            <div className="absolute inset-[18px] rounded-full bg-background" />
            <div className="relative text-center">
              <div className="text-5xl font-bold">{pendingTotal}</div>
              <div className="mt-1 text-muted-foreground">Total</div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {queueSegments.map((segment) => (
            <div key={segment.label} className="space-y-2">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-3 w-3 rounded-full ${segment.accent}`} />
                  <span className="text-base">{segment.label}</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {segment.value} ({segment.percentage}%)
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${segment.accent}`}
                  style={{ width: `${segment.percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
};
