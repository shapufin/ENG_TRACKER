import React from "react";
import { ClipboardCheck } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge, type StatusVariant } from "@/components/ui/StatusBadge";

interface PersonalDashboardPendingCardProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  personalPendingItems: any[];
}

export const PersonalDashboardPendingCard: React.FC<PersonalDashboardPendingCardProps> = ({
  personalPendingItems,
}) => (
  <GlassCard isHoverLift={false} className="p-6">
    <div className="mb-4">
      <p className="text-sm text-muted-foreground">My Pending Items</p>
      <h3 className="text-lg font-semibold tabular-nums">{personalPendingItems.length}/4</h3>
    </div>
    {personalPendingItems.length === 0 ? (
      <EmptyState icon={ClipboardCheck} title="You're all caught up!" className="p-6" />
    ) : (
      <div className="space-y-3">
        {personalPendingItems.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-xl border border-border bg-muted/[0.02] p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={item.label}>
                {item.label}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.date} · {item.amount}
              </p>
            </div>
            <StatusBadge variant={item.status as StatusVariant} />
          </div>
        ))}
      </div>
    )}
  </GlassCard>
);
