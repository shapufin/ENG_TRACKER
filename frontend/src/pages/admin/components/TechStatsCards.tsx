import React from "react";
import { StatCard } from "@/components/ui/StatCard";
import { Cpu, Layers, Users } from "lucide-react";
import type { Tech } from "@/types";

export const TechStatsCards: React.FC<{ techs: Tech[] }> = ({ techs }) => {
  const active = techs.filter((t) => t.is_active).length;
  const levels = techs.reduce((sum, t) => sum + (t.levels?.length ?? 0), 0);
  const assignments = techs.reduce((sum, t) => sum + (t.members_count ?? 0), 0);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatCard
        label="Active techs"
        value={active}
        icon={Cpu}
        iconTone="accent"
        trend={`of ${techs.length} total`}
      />
      <StatCard
        label="Seniority levels"
        value={levels}
        icon={Layers}
        iconTone="info"
        delay={0.05}
        trend="Across all techs"
      />
      <StatCard
        label="Assignments"
        value={assignments}
        icon={Users}
        iconTone="success"
        delay={0.1}
        trend="Engineers holding a tech"
      />
    </div>
  );
};
