import React from "react";
import { Handshake, CheckCircle2, AlertCircle, History } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import type { HbprAssignment } from "@/types/hbprAssignment";

interface HbprStatsCardsProps {
  assignments: HbprAssignment[];
}

export const HbprStatsCards: React.FC<HbprStatsCardsProps> = ({ assignments }) => {
  const activeAssignments = assignments.filter((a) => a.is_current);
  const onTrackCount = activeAssignments.filter((a) => a.cadence_status === "on_track").length;
  const attentionCount = activeAssignments.filter(
    (a) => a.cadence_status === "due" || a.cadence_status === "overdue"
  ).length;
  const endedCount = assignments.filter((a) => !a.is_current).length;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Total assignments"
        value={assignments.length}
        icon={Handshake}
        iconTone="accent"
        trend={`${activeAssignments.length} currently active`}
      />
      <StatCard
        label="Active on track"
        value={onTrackCount}
        icon={CheckCircle2}
        iconTone="success"
        delay={0.05}
        trend="Meeting schedule up to date"
      />
      <StatCard
        label="Needs attention"
        value={attentionCount}
        icon={AlertCircle}
        iconTone={attentionCount > 0 ? "warning" : "neutral"}
        delay={0.1}
        trend={attentionCount > 0 ? "Meetings due or overdue" : "All active cadences on track"}
      />
      <StatCard
        label="Ended / Archived"
        value={endedCount}
        icon={History}
        iconTone="neutral"
        delay={0.15}
        trend="Retained for partnership log"
      />
    </div>
  );
};
