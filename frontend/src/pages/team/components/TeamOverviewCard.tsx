import React from "react";
import { Calendar, Clock, Layers, Users } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { toneTextClass } from "@/components/ui/tone";

interface TeamOverviewCardProps {
  memberCount: number;
  teamCount: number;
  vacationDaysLeft: number;
  overtimeHours: number;
  standbyHours: number;
  pendingOvertimeHours?: number;
  pendingStandbyHours?: number;
  activeTab?: "overtime" | "standby" | "leave";
  isTeamsActive?: boolean;
  onSelectTeams?: () => void;
  onSelectLeave?: () => void;
  onSelectOvertime?: () => void;
  onSelectStandby?: () => void;
}

export const TeamOverviewCard: React.FC<TeamOverviewCardProps> = ({
  memberCount,
  teamCount,
  vacationDaysLeft,
  overtimeHours,
  standbyHours,
  pendingOvertimeHours = 0,
  pendingStandbyHours = 0,
  activeTab,
  isTeamsActive = false,
  onSelectTeams,
  onSelectLeave,
  onSelectOvertime,
  onSelectStandby,
}) => {
  const avgVacation =
    memberCount > 0 ? `${(vacationDaysLeft / memberCount).toFixed(1)} avg / member` : undefined;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard
        label="Teams"
        value={teamCount > 0 ? String(teamCount) : "–"}
        icon={Users}
        trend={`${memberCount} ${memberCount === 1 ? "member" : "members"}`}
        onClick={onSelectTeams}
        pressed={isTeamsActive}
      />
      <StatCard
        label="Vacation Left"
        value={vacationDaysLeft.toFixed(1)}
        valueColorClass={toneTextClass.success}
        icon={Calendar}
        iconTone="success"
        trend={avgVacation}
        onClick={onSelectLeave}
        pressed={activeTab === "leave"}
      />
      <StatCard
        label="Overtime (Mo)"
        value={overtimeHours.toFixed(2)}
        valueColorClass={toneTextClass.warning}
        icon={Clock}
        iconTone="warning"
        delta={
          pendingOvertimeHours > 0
            ? {
                text: `+${pendingOvertimeHours.toFixed(1)}h awaiting approval`,
                direction: "up",
                tone: "warning",
              }
            : undefined
        }
        onClick={onSelectOvertime}
        pressed={activeTab === "overtime"}
      />
      <StatCard
        label="Standby (Mo)"
        value={standbyHours.toFixed(2)}
        valueColorClass={toneTextClass.danger}
        icon={Layers}
        iconTone="danger"
        delta={
          pendingStandbyHours > 0
            ? {
                text: `+${pendingStandbyHours.toFixed(1)}h awaiting approval`,
                direction: "up",
                tone: "danger",
              }
            : undefined
        }
        onClick={onSelectStandby}
        pressed={activeTab === "standby"}
      />
    </div>
  );
};
