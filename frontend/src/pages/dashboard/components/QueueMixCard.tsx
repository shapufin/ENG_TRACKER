import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/badge";
const SEGMENT_COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-3))", "hsl(var(--chart-2))"];

interface QueueSegment {
  label: string;
  value: number;
  percentage: number;
  accent: string;
}

interface QueueMixCardProps {
  pendingTotal: number;
  queueSegments: QueueSegment[];
  complianceNote?: string;
}

export const QueueMixCard: React.FC<QueueMixCardProps> = ({
  pendingTotal,
  queueSegments,
  complianceNote = "Compliant with Work Regulations 2024",
}) => {
  const navigate = useNavigate();
  const donutBackground = useMemo(() => {
    const visibleSegments = queueSegments.filter((segment) => segment.value > 0);
    const segmentTotal = visibleSegments.reduce((sum, segment) => sum + segment.value, 0);
    const denominator = Math.max(pendingTotal, segmentTotal, 1);
    if (pendingTotal <= 0 && segmentTotal <= 0) return "hsl(var(--muted))";
    if (visibleSegments.length === 0) return "hsl(var(--muted))";
    const stops = visibleSegments.map((segment, index) => {
      const startValue = visibleSegments
        .slice(0, index)
        .reduce((sum, prior) => sum + prior.value, 0);
      const start = Math.min(360, (startValue / denominator) * 360);
      const end = Math.min(360, ((startValue + segment.value) / denominator) * 360);
      const color = SEGMENT_COLORS[index % SEGMENT_COLORS.length];
      return `${color} ${start}deg ${end}deg`;
    });
    return `conic-gradient(${stops.join(", ")})`;
  }, [pendingTotal, queueSegments]);
  const donutLabel = useMemo(() => {
    if (pendingTotal <= 0) return "No pending requests";
    return queueSegments
      .filter((segment) => segment.value > 0)
      .map((segment) => `${segment.label}: ${segment.value}`)
      .join(", ");
  }, [pendingTotal, queueSegments]);
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
          <div
            className="relative flex h-56 w-56 items-center justify-center rounded-full"
            role="img"
            aria-label={`Pending queue distribution. ${donutLabel}.`}
          >
            <div
              className="absolute inset-0 rounded-full blur-[1px]"
              style={{ background: donutBackground }}
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

        <div className="mt-4 flex items-center justify-between border-t border-line-subtle pt-3">
          <p className="text-sm text-muted-foreground">{complianceNote}</p>
          <button
            type="button"
            onClick={() => navigate("/team/approvals")}
            className="text-sm font-medium text-primary hover:underline"
          >
            Batch Assign
          </button>
        </div>
      </div>
    </GlassCard>
  );
};
