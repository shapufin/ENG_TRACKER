import React from "react";
import { StatCard } from "@/components/ui/StatCard";
import { Briefcase, CheckCircle2, PauseCircle } from "lucide-react";
import type { Client } from "@/types";

export const ClientStatsCards: React.FC<{ clients: Client[] }> = ({ clients }) => {
  const active = clients.filter((c) => c.is_active).length;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatCard
        label="Total clients"
        value={clients.length}
        icon={Briefcase}
        iconTone="accent"
        trend="Accounts in the catalog"
      />
      <StatCard
        label="Active"
        value={active}
        icon={CheckCircle2}
        iconTone="success"
        delay={0.05}
        trend="Selectable on new records"
      />
      <StatCard
        label="Inactive"
        value={clients.length - active}
        icon={PauseCircle}
        iconTone="warning"
        delay={0.1}
        trend="Kept for history only"
      />
    </div>
  );
};
