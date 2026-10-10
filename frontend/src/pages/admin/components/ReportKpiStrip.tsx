import React from "react";
import { CalendarDays, Clock, ClipboardList, Hourglass, Moon, Users } from "lucide-react";
import { StatCard, type StatDelta } from "@/components/ui/StatCard";
import type { SummaryReport } from "@/services/reportService";

interface ReportKpiStripProps {
  tab: "overtime_standby" | "vacation";
  summary: SummaryReport;
  scopeLabel: string;
}

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const MISSING = "—";
const MISSING_HINT = "Not included in this report";

const fmt = (n: number | undefined, suffix = ""): string =>
  typeof n === "number" && Number.isFinite(n) ? `${numberFormat.format(n)}${suffix}` : MISSING;

const hint = (text: string): StatDelta => ({ text, direction: "flat" });

type Hours = { total_hours: number; approved_hours: number; pending_count: number } | undefined;

const hoursDelta = (s: Hours): StatDelta =>
  s
    ? hint(`${fmt(s.approved_hours)}h approved · ${fmt(s.pending_count)} pending`)
    : hint(MISSING_HINT);

export const ReportKpiStrip: React.FC<ReportKpiStripProps> = ({ tab, summary, scopeLabel }) => {
  const { overtime, standby, leave } = summary;
  const pendingTotal =
    overtime && standby ? overtime.pending_count + standby.pending_count : undefined;
  const recordsTotal =
    overtime && standby ? overtime.total_entries + standby.total_entries : undefined;

  return (
    <section aria-label={`Report totals, ${scopeLabel}`}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tab === "overtime_standby" ? (
          <>
            <StatCard
              label="Overtime"
              value={fmt(overtime?.total_hours, "h")}
              icon={Clock}
              iconTone="info"
              delta={hoursDelta(overtime)}
            />
            <StatCard
              label="Standby"
              value={fmt(standby?.total_hours, "h")}
              icon={Moon}
              iconTone="accent"
              delta={hoursDelta(standby)}
            />
            <StatCard
              label="Pending decisions"
              value={fmt(pendingTotal)}
              icon={Hourglass}
              iconTone={pendingTotal ? "warning" : "neutral"}
              delta={pendingTotal === undefined ? hint(MISSING_HINT) : undefined}
              to="/admin/overtime-logs"
            />
            <StatCard
              label="Records"
              value={fmt(recordsTotal)}
              icon={ClipboardList}
              iconTone="neutral"
              delta={hint(recordsTotal === undefined ? MISSING_HINT : "entries in period")}
            />
          </>
        ) : (
          <>
            <StatCard
              label="Vacation days"
              value={fmt(leave?.total_days, "d")}
              icon={CalendarDays}
              iconTone="info"
              delta={leave ? undefined : hint(MISSING_HINT)}
            />
            <StatCard
              label="Approved"
              value={fmt(leave?.approved_days, "d")}
              icon={CalendarDays}
              iconTone="success"
              delta={leave ? undefined : hint(MISSING_HINT)}
            />
            <StatCard
              label="Pending"
              value={fmt(leave?.pending_count)}
              icon={Hourglass}
              iconTone={leave?.pending_count ? "warning" : "neutral"}
              delta={leave ? undefined : hint(MISSING_HINT)}
              to="/admin/leave-requests"
            />
            <StatCard
              label="Requests"
              value={fmt(leave?.total_requests)}
              icon={Users}
              iconTone="neutral"
              delta={leave ? hint("requests in period") : hint(MISSING_HINT)}
            />
          </>
        )}
      </div>
    </section>
  );
};
