import React from "react";
import { Clock } from "lucide-react";
import { AggregateCard } from "./AggregateCard";

interface OvertimeAggregateCardProps {
  total_hours: number;
  approved_hours: number;
  total_entries: number;
  pending_count: number;
}

export const OvertimeAggregateCard: React.FC<OvertimeAggregateCardProps> = (props) => (
  <AggregateCard
    title="Overtime Aggregate"
    description="Total capacity utilization from additional hours"
    color="blue"
    icon={<Clock className="h-5 w-5 text-primary" />}
    totalLabel="Total Hours Generated"
    approvedLabel="Successfully Approved"
    pendingLabel="awaiting verification"
    {...props}
  />
);
