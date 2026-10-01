import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/badge";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import type { MyPip } from "../../types/myRecords";

const statusText = (p: MyPip) => {
  if (p.status === "completed") return `Completed ${formatDateDDMMYYYY(p.closed_on)}`;
  if (p.status === "cancelled") return `Closed ${formatDateDDMMYYYY(p.closed_on)}`;
  return `In progress since ${formatDateDDMMYYYY(p.start_date)}`;
};

export const ImprovementPlan: React.FC<{ pips: MyPip[] }> = ({ pips }) => (
  <section aria-labelledby="my-plan-heading" className="space-y-3">
    <h2 id="my-plan-heading" className="text-lg font-semibold">
      Improvement plan
    </h2>
    <p className="text-sm text-muted-foreground">
      A plan to support you with focused goals and regular check-ins.
    </p>
    {pips.map((p) => (
      <GlassCard key={p.id} className="space-y-2 p-4">
        <Badge variant={p.status === "active" ? "info" : "neutral"}>{statusText(p)}</Badge>
        {p.shared_notes && <p className="whitespace-pre-wrap text-sm">{p.shared_notes}</p>}
      </GlassCard>
    ))}
  </section>
);
