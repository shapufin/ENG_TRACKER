import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { toneSurfaceClass, type Tone } from "@/components/ui/tone";
import type { KpiCoverageEntry, KpiStatus } from "../types/tlScorecard";

const STATUS_LABEL: Record<KpiStatus, string> = {
  measured: "Measured",
  approximate: "Approximate",
  planned: "Planned",
  blocked: "Blocked",
  excluded: "Excluded",
};

const STATUS_TONE: Record<KpiStatus, Tone> = {
  measured: "success",
  approximate: "warning",
  planned: "info",
  blocked: "danger",
  excluded: "neutral",
};

const StatusPill: React.FC<{ status: KpiStatus }> = ({ status }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${toneSurfaceClass[STATUS_TONE[status]]}`}
  >
    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
    {STATUS_LABEL[status]}
  </span>
);

interface KpiCoveragePanelProps {
  entries: KpiCoverageEntry[];
}

/** Every KPI from both TL job-description sheets, with its live coverage
 * status — the direct answer to "don't leave anything out": gaps stay
 * visible in the product, not just in a planning document. */
export const KpiCoveragePanel: React.FC<KpiCoveragePanelProps> = ({ entries }) => (
  <GlassCard animateOnMount={false} isHoverLift={false} className="p-4">
    <h2 className="text-sm font-semibold">KPI Coverage</h2>
    <p className="mt-1 text-xs text-muted-foreground">
      Every KPI from both TL role sheets, and how this tool currently measures it.
    </p>
    <ul className="mt-3 divide-y divide-border/50">
      {entries.map((entry) => (
        <li key={entry.kpi} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{entry.kpi}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{entry.note}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusPill status={entry.status} />
            {entry.phase !== null && (
              <span className="text-xs text-muted-foreground">Phase {entry.phase}</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  </GlassCard>
);
