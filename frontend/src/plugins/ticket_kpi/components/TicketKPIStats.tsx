import React from "react";
import { KPICard } from "./KPICard";
import { Ticket, Clock, CheckCircle, TrendingUp, Gauge } from "lucide-react";
import type { MonthlyKPIComparison } from "../types/ticketKPI";

interface TicketKPIStatsProps {
  total: number;
  closed: number;
  avgRes: number | string;
  sla: number | string;
  p50?: number | string;
  p90?: number | string;
  comparison?: MonthlyKPIComparison | null;
}

const fmtHours = (v: number | string | undefined) =>
  typeof v === "number" ? `${v}h` : (v ?? "N/A");

const fmtPct = (v: number | string | undefined) => (typeof v === "number" ? `${v}%` : (v ?? "N/A"));

export const TicketKPIStats: React.FC<TicketKPIStatsProps> = ({
  total,
  closed,
  avgRes,
  sla,
  p50,
  p90,
  comparison,
}) => (
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
    <KPICard
      title="Total Tickets"
      value={total}
      subtitle="This month"
      icon={Ticket}
      delta={comparison?.total_tickets_delta}
      deltaLabel={`vs ${comparison?.month ?? "last month"}`}
    />
    <KPICard
      title="Avg Resolution"
      value={fmtHours(avgRes)}
      subtitle="Per ticket"
      icon={Clock}
      delta={comparison?.avg_resolution_delta}
      deltaLabel={`vs ${comparison?.month ?? "last month"}`}
      lowerIsBetter
    />
    <KPICard
      title="Median (p50)"
      value={fmtHours(p50)}
      subtitle="Typical resolution"
      icon={Gauge}
      delta={comparison?.p50_resolution_delta}
      deltaLabel={`vs ${comparison?.month ?? "last month"}`}
      lowerIsBetter
    />
    <KPICard
      title="90th Percentile"
      value={fmtHours(p90)}
      subtitle="Worst-case tail"
      icon={Gauge}
      delta={comparison?.p90_resolution_delta}
      deltaLabel={`vs ${comparison?.month ?? "last month"}`}
      lowerIsBetter
    />
    <KPICard
      title="SLA Compliance"
      value={fmtPct(sla)}
      subtitle="On target"
      icon={CheckCircle}
      delta={comparison?.sla_compliance_delta}
      deltaLabel={`vs ${comparison?.month ?? "last month"}`}
    />
    <KPICard
      title="Tickets Closed"
      value={closed}
      subtitle="This month"
      icon={TrendingUp}
      delta={comparison?.closed_tickets_delta}
      deltaLabel={`vs ${comparison?.month ?? "last month"}`}
    />
  </div>
);
