import React from "react";
import { StatCard } from "@/components/ui/StatCard";
import { Users, Crown, UserX, Activity } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { StatCardProps } from "@/components/ui/StatCard";

interface UserStats {
  total_users: number;
  italian_tl_count: number;
  albanian_tl_count: number;
  no_tl_count: number;
  active_today_count: number;
}

interface UserStatsCardsProps {
  stats: UserStats;
}

const CARDS: {
  key: keyof UserStats;
  label: string;
  sub: string;
  icon: LucideIcon;
  glow: NonNullable<StatCardProps["glow"]>;
  iconColorClass?: string;
}[] = [
  {
    key: "total_users",
    label: "Total Users",
    sub: "All team members",
    icon: Users,
    glow: "primary",
  },
  {
    key: "italian_tl_count",
    label: "Italian TL",
    sub: "Team leads",
    icon: Crown,
    glow: "warning",
    iconColorClass: "text-icon-sick",
  },
  {
    key: "albanian_tl_count",
    label: "Albanian TL",
    sub: "Team leads",
    icon: Crown,
    glow: "primary",
    iconColorClass: "text-primary/50",
  },
  {
    key: "no_tl_count",
    label: "No TL",
    sub: "Unassigned",
    icon: UserX,
    glow: "none",
    iconColorClass: "text-muted-foreground",
  },
  {
    key: "active_today_count",
    label: "Active Today",
    sub: "Active users",
    icon: Activity,
    glow: "success",
    iconColorClass: "text-success",
  },
];

export const UserStatsCards: React.FC<UserStatsCardsProps> = ({ stats }) => {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {CARDS.map((c, i) => (
        <StatCard
          key={c.key}
          label={c.label}
          value={stats[c.key]}
          icon={c.icon}
          glow={c.glow}
          iconColorClass={c.iconColorClass}
          delay={i * 0.05}
          trend={c.sub}
        />
      ))}
    </div>
  );
};
