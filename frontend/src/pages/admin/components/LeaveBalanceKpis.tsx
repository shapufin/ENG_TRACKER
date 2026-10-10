import React from "react";
import { CalendarCheck, CalendarClock, Hourglass, Layers } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { CARRYOVER_WINDOW_DAYS, type BalanceTotals } from "../hooks/leaveBalanceFilters";

interface LeaveBalanceKpisProps {
  totals: BalanceTotals;
  expiringOnly: boolean;
  onToggleExpiring(): void;
}

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const days = (n: number) => `${numberFormat.format(n)}d`;

export const LeaveBalanceKpis: React.FC<LeaveBalanceKpisProps> = ({
  totals,
  expiringOnly,
  onToggleExpiring,
}) => (
  <section aria-label="Balance totals for the current filters">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Allocated" value={days(totals.allocated)} icon={Layers} iconTone="info" />
      <StatCard
        label="Used"
        value={days(totals.used)}
        icon={CalendarCheck}
        iconTone="success"
        delta={
          totals.usedPct === null
            ? undefined
            : { text: `${totals.usedPct}% of allocated`, direction: "flat" }
        }
      />
      <StatCard
        label="Pending"
        value={days(totals.pending)}
        icon={Hourglass}
        iconTone={totals.pending > 0 ? "warning" : "neutral"}
      />
      <StatCard
        label="Carry-over at risk"
        value={days(totals.atRisk)}
        icon={CalendarClock}
        iconTone={totals.atRisk > 0 ? "warning" : "neutral"}
        delta={{
          text: expiringOnly
            ? "Showing expiring only"
            : `Expiring within ${CARRYOVER_WINDOW_DAYS} days`,
          direction: "flat",
          tone: totals.atRisk > 0 ? "warning" : "neutral",
        }}
        onClick={onToggleExpiring}
      />
    </div>
  </section>
);
