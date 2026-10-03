import React from "react";
import { CheckCircle2, ClipboardList, Clock } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { toneTextClass } from "@/components/ui/tone";
import { recordStripStats } from "./recordStripStats";
import type { KindConfig, RecordRow } from "./recordKinds";

interface RecordStripProps {
  config: KindConfig<RecordRow>;
  /** Rows after the month filter — the strip always describes what is listed. */
  rows: RecordRow[];
  /** Rows before the month filter, for scope context. */
  totalCount: number;
  /** Full `YYYY-MM-DD` month value, or "" for every month. */
  month: string;
}

/** At-a-glance counts from already-loaded rows; tones match the table badges. */
export const RecordStrip: React.FC<RecordStripProps> = ({ config, rows, totalCount, month }) => {
  const stats = recordStripStats(config, rows);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatCard
        label="Total"
        value={stats.total}
        icon={ClipboardList}
        trend={month ? `of ${totalCount} total` : "across all months"}
      />
      <StatCard
        label="Needs attention"
        value={stats.attention}
        icon={Clock}
        iconColorClass={toneTextClass.warning}
        trend={stats.attention === 0 ? "All clear" : "Open or overdue"}
      />
      <StatCard
        label="Completed"
        value={stats.done}
        icon={CheckCircle2}
        iconColorClass={toneTextClass.success}
        progressPercent={stats.donePct}
      />
    </div>
  );
};
