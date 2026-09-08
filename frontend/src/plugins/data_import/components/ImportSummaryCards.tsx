import React from "react";
import { StatCard } from "@/components/ui/StatCard";
import { FileCheck, Plus, RefreshCw, SkipForward, AlertCircle } from "lucide-react";

interface ImportSummaryCardsProps {
  summary: {
    total: number;
    created?: number;
    updated?: number;
    skipped?: number;
    error?: number;
    valid?: number;
    warning?: number;
  };
  mode?: "preview" | "commit";
}

export const ImportSummaryCards: React.FC<ImportSummaryCardsProps> = ({
  summary,
  mode = "preview",
}) => {
  const isPreview = mode === "preview";

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Total Rows" value={summary.total} icon={FileCheck} />
      {isPreview ? (
        <>
          <StatCard label="Valid" value={summary.valid ?? 0} icon={FileCheck} />
          <StatCard label="Warnings" value={summary.warning ?? 0} icon={AlertCircle} />
          <StatCard
            label="Errors"
            value={summary.error ?? 0}
            icon={AlertCircle}
            glow="destructive"
          />
        </>
      ) : (
        <>
          <StatCard label="Created" value={summary.created ?? 0} icon={Plus} />
          <StatCard label="Updated" value={summary.updated ?? 0} icon={RefreshCw} />
          <StatCard label="Skipped" value={summary.skipped ?? 0} icon={SkipForward} />
          <StatCard
            label="Errors"
            value={summary.error ?? 0}
            icon={AlertCircle}
            glow="destructive"
          />
        </>
      )}
    </div>
  );
};
