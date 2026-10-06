import React from "react";
import { HeartHandshake } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/badge";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import type { MyPip } from "../../types/myRecords";

const statusText = (p: MyPip) => {
  if (p.status === "completed") return `Completed ${formatDateDDMMYYYY(p.closed_on)}`;
  if (p.status === "cancelled") return `Closed ${formatDateDDMMYYYY(p.closed_on)}`;
  return `In progress since ${formatDateDDMMYYYY(p.start_date)}`;
};

const STATUS_VARIANT = { active: "info", completed: "success", cancelled: "neutral" } as const;

export const ImprovementPlan: React.FC<{ pips: MyPip[] }> = ({ pips }) => (
  <section aria-labelledby="my-plan-heading" className="space-y-3">
    <h2 id="my-plan-heading" className="text-lg font-semibold">
      Improvement plan
    </h2>
    <p className="text-muted-foreground flex items-start gap-2 text-sm">
      <HeartHandshake className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>A plan to support you with focused goals and regular check-ins.</span>
    </p>
    {pips.map((p) => (
      <GlassCard key={p.id} className="space-y-2 p-4">
        <Badge variant={STATUS_VARIANT[p.status]}>{statusText(p)}</Badge>
        {p.shared_notes && (
          <p className="text-sm break-words whitespace-pre-wrap">{p.shared_notes}</p>
        )}
      </GlassCard>
    ))}
  </section>
);
