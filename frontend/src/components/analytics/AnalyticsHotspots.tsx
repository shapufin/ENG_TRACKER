import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { AlertTriangle } from "lucide-react";
import type { Hotspot } from "./types";

interface AnalyticsHotspotsProps {
  hotspots: Hotspot[] | undefined;
}

export const AnalyticsHotspots: React.FC<AnalyticsHotspotsProps> = ({ hotspots }) => {
  if (!hotspots || hotspots.length === 0) return null;

  return (
    <div className="grid gap-4 md:grid-cols-1">
      <GlassCard className="border-destructive/30 bg-destructive/5">
        <div className="flex items-start gap-4 p-4">
          <div className="rounded-full bg-destructive/10 p-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">
              {hotspots.length} System Hotspots Detected
            </h4>
            <p className="mt-1 text-xs text-muted-foreground">
              The following teams have shown abnormal overtime or standby activity this period.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {hotspots.map((h, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-full border border-destructive/20 bg-destructive/10 px-2 py-1 text-[10px] font-medium text-foreground"
                >
                  {h.team}: {h.hours}h ({h.severity})
                </span>
              ))}
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
};
