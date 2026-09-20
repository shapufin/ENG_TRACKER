import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight, ClipboardCheck } from "lucide-react";
import { DashboardSectionShell } from "@/components/dashboard/DashboardSectionShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge, type StatusVariant } from "@/components/ui/StatusBadge";

interface PersonalDashboardPendingCardProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  personalPendingItems: any[];
}

export const PersonalDashboardPendingCard: React.FC<PersonalDashboardPendingCardProps> = ({
  personalPendingItems,
}) => (
  <DashboardSectionShell
    title={`${personalPendingItems.length}/4`}
    subtitle="My Pending Items"
    bodyClassName="flex flex-col gap-3"
  >
    {personalPendingItems.length === 0 ? (
      <EmptyState icon={ClipboardCheck} title="You're all caught up!" className="p-6" />
    ) : (
      <>
        {personalPendingItems.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/[0.02] p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={item.label}>
                {item.label}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.date} · {item.amount}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <StatusBadge variant={item.status as StatusVariant} />
              {item.detailsPath && (
                <Link
                  to={item.detailsPath}
                  className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                >
                  View Details <ChevronRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          </div>
        ))}
      </>
    )}
  </DashboardSectionShell>
);
