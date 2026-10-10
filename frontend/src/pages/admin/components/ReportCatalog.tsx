import React from "react";
import { Clock, FileSpreadsheet, Moon, Palmtree, type LucideIcon } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { IconWell } from "@/components/ui/IconWell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Tone } from "@/components/ui/tone";
import type { SummaryReport } from "@/services/reportService";

export type ReportKind = "overtime" | "standby" | "leave";

interface ReportCatalogProps {
  tab: "overtime_standby" | "vacation";
  summary: SummaryReport | null;
  start: string;
  end: string;
  scopeLabel: string;
  canExport: boolean;
  onExport(kind: ReportKind): void;
  onView(): void;
}

interface CatalogEntry {
  kind: ReportKind;
  title: string;
  description: string;
  icon: LucideIcon;
  tone: Tone;
  unit: "h" | "d";
}

const ENTRIES: Record<ReportCatalogProps["tab"], CatalogEntry[]> = {
  overtime_standby: [
    {
      kind: "overtime",
      title: "Overtime ledger",
      description: "Every overtime entry in the period, per person.",
      icon: Clock,
      tone: "info",
      unit: "h",
    },
    {
      kind: "standby",
      title: "Standby ledger",
      description: "Every standby shift in the period, per person.",
      icon: Moon,
      tone: "accent",
      unit: "h",
    },
  ],
  vacation: [
    {
      kind: "leave",
      title: "Vacation ledger",
      description: "Every leave request in the period, with approved days.",
      icon: Palmtree,
      tone: "success",
      unit: "d",
    },
  ],
};

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

const num = (n: number | undefined, suffix = ""): string =>
  typeof n === "number" && Number.isFinite(n) ? `${numberFormat.format(n)}${suffix}` : "—";

/** Parse yyyy-mm-dd as a local calendar date. */
const formatDay = (value: string): string => {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return "—";
  return dateFormat.format(new Date(y, m - 1, d));
};

const metrics = (kind: ReportKind, summary: SummaryReport | null) => {
  if (!summary) return { records: undefined, total: undefined };
  if (kind === "leave") {
    return { records: summary.leave?.total_requests, total: summary.leave?.total_days };
  }
  const s = summary[kind];
  return { records: s?.total_entries, total: s?.total_hours };
};

export const ReportCatalog: React.FC<ReportCatalogProps> = ({
  tab,
  summary,
  start,
  end,
  scopeLabel,
  canExport,
  onExport,
  onView,
}) => (
  <section aria-label="Available reports" className="grid grid-cols-1 gap-3 lg:grid-cols-2">
    {ENTRIES[tab].map((entry) => {
      const Icon = entry.icon;
      const { records, total } = metrics(entry.kind, summary);
      const disabled = !summary || !canExport;
      const exportButton = (
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onExport(entry.kind)}
        >
          <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden="true" />
          Export XLSX
          <span className="sr-only"> {entry.title}</span>
        </Button>
      );
      return (
        <GlassCard key={entry.kind}>
          <div className="flex flex-col gap-3 p-4">
            <div className="flex items-start gap-3">
              <IconWell tone={entry.tone}>
                <Icon className="h-4 w-4" />
              </IconWell>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold">{entry.title}</h3>
                <p className="text-muted-foreground mt-0.5 text-xs">{entry.description}</p>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                <Badge variant="neutral">XLSX</Badge>
                <Badge variant="info">{scopeLabel}</Badge>
              </div>
            </div>
            <dl className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <div className="flex gap-1">
                <dt>Period</dt>
                <dd className="text-foreground">
                  {formatDay(start)} – {formatDay(end)}
                </dd>
              </div>
              <div className="flex gap-1">
                <dt>Records</dt>
                <dd className="text-foreground tabular-nums">{num(records)}</dd>
              </div>
              <div className="flex gap-1">
                <dt>Total</dt>
                <dd className="text-foreground tabular-nums">{num(total, entry.unit)}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onView}>
                View<span className="sr-only"> {entry.title}</span>
              </Button>
              {summary ? (
                exportButton
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0}>{exportButton}</span>
                  </TooltipTrigger>
                  <TooltipContent>Generate first</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </GlassCard>
      );
    })}
  </section>
);
