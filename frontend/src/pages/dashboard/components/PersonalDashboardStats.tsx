import React from "react";
import { Clock, Activity, Plane, Shield } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import type { User } from "@/types";

interface PersonalDashboardStatsProps {
  user: User | null;
  personalOvertimeHours: number;
  personalStandbyHours: number;
  vacationBalanceDays: number;
}

export const PersonalDashboardStats: React.FC<PersonalDashboardStatsProps> = ({
  user,
  personalOvertimeHours,
  personalStandbyHours,
  vacationBalanceDays,
}) => (
  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
    <StatCard
      label="Overtime Hours"
      value={<AnimatedNumber value={personalOvertimeHours} suffix="h" />}
      icon={Clock}
      glow="primary"
      delay={0}
    />
    <StatCard
      label="Standby Hours"
      value={<AnimatedNumber value={personalStandbyHours} suffix="h" />}
      icon={Activity}
      glow="success"
      iconColorClass="text-success"
      delay={0.05}
    />
    <StatCard
      label="Vacation Days Remaining"
      value={<AnimatedNumber value={vacationBalanceDays} suffix="d" />}
      icon={Plane}
      glow="warning"
      iconColorClass="text-warning"
      trend="See Calendar for booked days"
      delay={0.1}
    />
    <StatCard
      label="System Status"
      value={user?.username || "Active"}
      icon={Shield}
      glow="destructive"
      iconColorClass="text-destructive"
      delay={0.15}
      statusDotLabel="System active"
    />
  </div>
);
