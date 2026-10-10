import React from "react";
import { StatCard } from "@/components/ui/StatCard";
import { Users, Crown, UserX, Activity } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { StatCardProps } from "@/components/ui/StatCard";
import type { Tone } from "@/components/ui/tone";

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
  iconTone: Tone;
}[] = [
  {
    key: "total_users",
    label: "Total Users",
    sub: "All team members",
    icon: Users,
    glow: "primary",
    iconTone: "accent",
  },
  {
    key: "italian_tl_count",
    label: "Italian TL",
    sub: "Team leads",
    icon: Crown,
    glow: "warning",
    iconTone: "warning",
  },
  {
    key: "albanian_tl_count",
    label: "Albanian TL",
    sub: "Team leads",
    icon: Crown,
    glow: "primary",
    iconTone: "info",
  },
  {
    key: "no_tl_count",
    label: "No TL",
    sub: "Unassigned",
    icon: UserX,
    glow: "none",
    iconTone: "neutral",
  },
  {
    key: "active_today_count",
    label: "Active Today",
    sub: "Active users",
    icon: Activity,
    glow: "success",
    iconTone: "success",
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
          iconTone={c.iconTone}
          delay={i * 0.05}
          trend={c.sub}
        />
      ))}
    </div>
  );
};
