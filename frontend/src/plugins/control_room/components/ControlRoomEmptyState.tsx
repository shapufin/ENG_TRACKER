/**
 * ControlRoomEmptyState — differentiates 4 empty-state cases:
 * 1. No Control Room access.
 * 2. Access exists but no teams assigned.
 * 3. Teams assigned but no standby data in the selected period.
 * 4. Query failed.
 */
import React from "react";
import { ShieldAlert, Users, CalendarX, AlertCircle } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState } from "@/components/ui/EmptyState";
import type { LucideIcon } from "lucide-react";

type EmptyReason = "no_access" | "no_teams" | "no_data" | "error";

interface Props {
  reason: EmptyReason;
}

const config: Record<EmptyReason, { icon: LucideIcon; title: string; message: string }> = {
  no_access: {
    icon: ShieldAlert,
    title: "No Control Room Access",
    message:
      "You do not have a Control Room access record. Contact an administrator to request access.",
  },
  no_teams: {
    icon: Users,
    title: "No Teams Assigned",
    message:
      "Your Control Room access has no teams assigned. An administrator must assign teams before you can see standby data.",
  },
  no_data: {
    icon: CalendarX,
    title: "No Standby Data",
    message: "No standby entries match the selected filters for your scoped teams in this period.",
  },
  error: {
    icon: AlertCircle,
    title: "Query Failed",
    message:
      "The dashboard data could not be loaded. Try refreshing. If the problem persists, contact support.",
  },
};

export const ControlRoomEmptyState: React.FC<Props> = ({ reason }) => {
  const { icon, title, message } = config[reason];
  return (
    <GlassCard isHoverLift={false}>
      <EmptyState icon={icon} title={title} description={message} />
    </GlassCard>
  );
};
