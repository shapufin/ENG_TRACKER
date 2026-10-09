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
          <div className="bg-destructive/10 rounded-full p-2">
            <AlertTriangle className="text-destructive h-5 w-5" />
          </div>
          <div>
            <h4 className="text-foreground text-sm font-semibold">
              {hotspots.length} System Hotspots Detected
            </h4>
            <p className="text-muted-foreground mt-1 text-xs">
              The following teams have shown abnormal overtime or standby activity this period.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {hotspots.map((h, i) => (
                <span
                  key={i}
                  className="border-destructive/20 bg-destructive/10 text-foreground inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium"
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
