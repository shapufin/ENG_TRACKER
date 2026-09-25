import React from "react";
import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { GlassCard } from "@/components/ui/GlassCard";
import { toneSurfaceClass } from "@/components/ui/tone";
import type { EscalationCandidate } from "../types/tlScorecard";

const KIND_LABEL: Record<string, string> = {
  leave_pending: "Leave pending too long",
  idle_flag_stale: "Idle flag stale",
  pip_pending_approval: "PIP pending HR approval",
  absence_unaddressed: "Absence unaddressed",
};

interface EscalationsPanelProps {
  candidates: EscalationCandidate[];
}

/** Computed, not logged — every row here comes from a breach already
 * tracked elsewhere (leave SLA, idle flags, PIP approval, absences). No
 * manual escalation entry exists; this list IS the "0 escalations" KPI. */
export const EscalationsPanel: React.FC<EscalationsPanelProps> = ({ candidates }) => (
  <GlassCard animateOnMount={false} isHoverLift={false} className="p-4">
    <h2 className="text-sm font-semibold">Escalation risks</h2>
    <p className="mt-1 text-xs text-muted-foreground">
      Computed live from breaches already tracked — nothing here was manually logged.
    </p>
    {candidates.length === 0 ? (
      <EmptyState
        icon={ShieldAlert}
        title="Nothing needs escalating"
        description="No breaches detected across leave, idle flags, PIPs, or absences."
        className="py-6"
      />
    ) : (
      <ul className="mt-3 divide-y divide-border/50">
        {candidates.map((c, idx) => (
          <li key={`${c.kind}-${c.subject_id}-${idx}`} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">{c.subject_name}</p>
              <p className="text-xs text-muted-foreground">{c.detail}</p>
            </div>
            <span
              className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${toneSurfaceClass.danger}`}
            >
              {KIND_LABEL[c.kind] ?? c.kind}
            </span>
          </li>
        ))}
      </ul>
    )}
  </GlassCard>
);
