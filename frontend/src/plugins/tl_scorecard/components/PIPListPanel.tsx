import React from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { GlassCard } from "@/components/ui/GlassCard";
import { toneSurfaceClass } from "@/components/ui/tone";
import type { PIPRecord } from "../types/tlScorecard";

interface PIPListPanelProps {
  records: PIPRecord[];
  canApprove: boolean;
  onApprove: (id: number) => void;
  isApproving: boolean;
}

export const PIPListPanel: React.FC<PIPListPanelProps> = ({ records, canApprove, onApprove, isApproving }) => (
  <GlassCard animateOnMount={false} isHoverLift={false} className="p-4">
    <h2 className="text-sm font-semibold">PIPs</h2>
    {records.length === 0 ? (
      <EmptyState icon={ShieldCheck} title="No PIPs open" className="py-6" />
    ) : (
      <ul className="mt-3 divide-y divide-border/50">
        {records.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">{r.employee_name}</p>
              <p className="text-xs text-muted-foreground">
                Started {r.start_date} · {r.approved_at ? `Approved by ${r.approved_by_name}` : "Pending HR approval"}
              </p>
            </div>
            {r.approved_at ? (
              <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${toneSurfaceClass.success}`}>
                Approved
              </span>
            ) : canApprove ? (
              <Button size="sm" variant="outline" disabled={isApproving} onClick={() => onApprove(r.id)}>
                Approve
              </Button>
            ) : (
              <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${toneSurfaceClass.warning}`}>
                Pending
              </span>
            )}
          </li>
        ))}
      </ul>
    )}
  </GlassCard>
);
