import React from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CalendarClock, CheckCircle2, FileSpreadsheet, Loader2 } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { formatBytes, type ExportJob } from "@/lib/analyticsExports";
import { useReportArchive } from "../hooks/useReportArchive";

const STATUS: Record<
  ExportJob["status"],
  { label: string; icon: React.ReactNode; variant: "success" | "warning" | "info" | "destructive" }
> = {
  pending: {
    label: "Pending",
    icon: <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />,
    variant: "warning",
  },
  running: {
    label: "Running",
    icon: <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />,
    variant: "info",
  },
  completed: {
    label: "Completed",
    icon: <CheckCircle2 className="h-3 w-3" aria-hidden="true" />,
    variant: "success",
  },
  failed: {
    label: "Failed",
    icon: <AlertCircle className="h-3 w-3" aria-hidden="true" />,
    variant: "destructive",
  },
};

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const formatDate = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dateFormat.format(d);
};

export const ReportArchivePanel: React.FC = () => {
  const { enabled, exports, schedules } = useReportArchive();
  if (!enabled) return null;

  const jobs = exports.data.slice(0, 5);
  const active = schedules.data.filter((s) => s.is_active);
  const nextRun = active
    .map((s) => s.next_run_at)
    .filter((v): v is string => !!v)
    .sort()[0];

  return (
    <aside aria-label="Report archive" className="flex flex-col gap-3">
      <GlassCard>
        <div className="flex flex-col gap-2 p-4">
          <SectionHeading title="Recent exports" />
          {exports.enabled &&
            (jobs.length === 0 ? (
              <EmptyState
                size="sm"
                icon={FileSpreadsheet}
                title="No exports yet"
                description="Exports you generate appear here."
                className="px-0"
              />
            ) : (
              <ul className="divide-border divide-y">
                {jobs.map((job) => {
                  const s = STATUS[job.status];
                  return (
                    <li key={job.job_id} className="flex flex-wrap items-center gap-2 py-2 text-xs">
                      <Badge variant="neutral">{job.format === "excel" ? "XLSX" : "CSV"}</Badge>
                      <Badge variant={s.variant} className="gap-1">
                        {s.icon}
                        {s.label}
                      </Badge>
                      <span className="text-muted-foreground ml-auto tabular-nums">
                        {formatBytes(job.file_size_bytes)}
                      </span>
                      <span className="text-muted-foreground">{formatDate(job.created_at)}</span>
                    </li>
                  );
                })}
              </ul>
            ))}
        </div>
      </GlassCard>
      {schedules.enabled && (
        <GlassCard>
          <div className="flex flex-col gap-2 p-4">
            <SectionHeading title={`Active schedules: ${active.length}`} />
            {nextRun ? (
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                Next run {formatDate(nextRun)}
              </p>
            ) : (
              <EmptyState
                size="sm"
                icon={CalendarClock}
                title="Nothing scheduled"
                className="px-0"
              />
            )}
          </div>
        </GlassCard>
      )}
      <Link
        to="/admin/analytics"
        className="text-primary inline-flex min-h-6 items-center text-xs hover:underline"
      >
        Manage in Analytics
      </Link>
    </aside>
  );
};
