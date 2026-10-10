import React from "react";
import type { LucideIcon } from "lucide-react";
import { CheckCircle2, Hourglass } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { SectionHeading } from "@/components/ui/SectionHeading";

interface AggregateCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  total_hours: number;
  approved_hours: number;
  total_entries: number;
  pending_count: number;
  totalLabel: string;
  approvedLabel: string;
  pendingLabel: string;
}

export const AggregateCard: React.FC<AggregateCardProps> = ({
  title,
  description,
  icon,
  total_hours,
  approved_hours,
  total_entries,
  pending_count,
  totalLabel,
  approvedLabel,
  pendingLabel,
}) => (
  <section aria-label={title} className="space-y-3">
    <SectionHeading title={title} meta={description} />
    <div className="grid gap-3 sm:grid-cols-3">
      <StatCard
        label={totalLabel}
        value={total_hours}
        icon={icon}
        iconTone="info"
        trend={`${total_entries} logs`}
      />
      <StatCard
        label={approvedLabel}
        value={approved_hours}
        icon={CheckCircle2}
        iconTone="success"
      />
      <StatCard
        label="Pending"
        value={pending_count}
        icon={Hourglass}
        iconTone={pending_count > 0 ? "warning" : "neutral"}
        trend={pendingLabel}
      />
    </div>
  </section>
);
