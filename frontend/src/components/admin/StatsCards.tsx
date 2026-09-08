import React from "react";
import { Users, Clock3, CheckCircle2, XCircle } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";

interface BaseStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

interface StatsCardsProps extends BaseStats {
  additionalCards?: React.ReactNode;
}

/**
 * Reusable stats cards for admin log pages.
 * Shows total, pending, approved, and rejected counts.
 *
 * Extracted from duplicated code in:
 * - LeaveRequestsPage (with vacation/sick cards)
 * - OvertimeLogsPage (base 4 cards)
 * - StandbyLogsPage (base 4 cards)
 */
export const StatsCards: React.FC<StatsCardsProps> = ({
  total,
  pending,
  approved,
  rejected,
  additionalCards,
}) => {
  return (
    <div className="grid gap-4 lg:grid-cols-6">
      <StatCard label="Total" value={total} icon={Users} glow="primary" />
      <StatCard
        label="Pending"
        value={pending}
        icon={Clock3}
        glow="warning"
        iconColorClass="text-warning"
      />
      <StatCard
        label="Approved"
        value={approved}
        icon={CheckCircle2}
        glow="success"
        iconColorClass="text-success"
      />
      <StatCard
        label="Rejected"
        value={rejected}
        icon={XCircle}
        glow="destructive"
        iconColorClass="text-destructive"
      />
      {additionalCards}
    </div>
  );
};
