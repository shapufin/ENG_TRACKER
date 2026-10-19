import React from "react";
import { StatCard } from "@/components/ui/StatCard";
import { Building2, Users, UserX, CalendarDays } from "lucide-react";

export interface TeamStats {
  total: number;
  members: number;
  noLeader: number;
  groups: number;
}

export const TeamStatsCards: React.FC<TeamStats> = ({ total, members, noLeader, groups }) => {
  const cards = [
    {
      label: "Total Teams",
      value: total,
      sub: "Operational teams",
      icon: Building2,
      glow: "primary" as const,
      iconTone: "accent" as const,
    },
    {
      label: "Members Assigned",
      value: members,
      sub: "Active roster headcount",
      icon: Users,
      glow: "success" as const,
      iconTone: "success" as const,
    },
    {
      label: "Missing TL",
      value: noLeader,
      sub: "Teams missing an IT or AL TL",
      icon: UserX,
      glow: "none" as const,
      iconTone: "warning" as const,
    },
    {
      label: "Calendar Groups",
      value: groups,
      sub: "Shared calendar clusters",
      icon: CalendarDays,
      glow: "none" as const,
      iconTone: "info" as const,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {cards.map((c, i) => (
        <StatCard
          key={c.label}
          label={c.label}
          value={c.value}
          icon={c.icon}
          glow={c.glow}
          iconTone={c.iconTone}
          delay={i * 0.05}
          trend={c.sub}
        />
      ))}
    </div>
  );
};
