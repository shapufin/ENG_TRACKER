import React from "react";
import { ExternalLink, FileClock, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { GlassCard } from "@/components/ui/GlassCard";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserAvatar } from "@/components/calendar/UserAvatar";
import { ExportButton } from "../ExportButton";
import { avatarSeed } from "../avatarSeed";
import type { HbprEvidence, HbprLeaderRow } from "../../types/tlScorecard";
import { EVIDENCE_KIND_LABELS, EVIDENCE_KIND_TONE, formatDate } from "./hbprMeta";
import { PageNav } from "./PageNav";

const ALL = "all";

interface HbprEvidenceTimelineProps {
  /** The current server page, already filtered by year and leader. */
  evidence: HbprEvidence[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  leaders: HbprLeaderRow[];
  year: number;
  leaderFilter: number | null;
  onLeaderFilterChange: (leaderId: number | null) => void;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

/** Read-only timeline of cadence meetings and EPR participation evidence. */
export const HbprEvidenceTimeline: React.FC<HbprEvidenceTimelineProps> = ({
  evidence,
  total,
  page,
  pageSize,
  onPageChange,
  leaders,
  year,
  leaderFilter,
  onLeaderFilterChange,
  isLoading,
  isError,
  onRetry,
}) => {
  const byId = new Map(leaders.map((l) => [l.id, l]));
  const rows = evidence;

  return (
    <section aria-label={`Governance evidence · ${year}`} className="space-y-4">
      <h2 className="text-muted-foreground text-sm font-semibold">Governance evidence · {year}</h2>
      <GlassCard animateOnMount={false} isHoverLift={false} className="p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="w-full sm:max-w-xs">
            <Label htmlFor="hbpr-evidence-leader">Albanian team leader</Label>
            <Select
              value={leaderFilter === null ? ALL : String(leaderFilter)}
              onValueChange={(v) => onLeaderFilterChange(v === ALL ? null : Number(v))}
            >
              <SelectTrigger id="hbpr-evidence-leader" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All team leaders</SelectItem>
                {leaders.map((leader) => (
                  <SelectItem key={leader.id} value={String(leader.id)}>
                    {leader.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {leaderFilter !== null && <ExportButton leaderId={leaderFilter} />}
        </div>
      </GlassCard>

      {isError ? (
        <ErrorCard title="Could not load governance evidence" onRetry={onRetry} />
      ) : isLoading ? (
        <div aria-busy="true" className="space-y-2">
          <span className="sr-only">Loading governance evidence…</span>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-muted/40 h-20 animate-pulse rounded-xl border" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <GlassCard animateOnMount={false} isHoverLift={false} className="p-0">
          <EmptyState
            icon={History}
            title={`No governance evidence recorded in ${year}`}
            description="The assigned Albanian team leader records cadence meetings and EPR participation evidence."
            className="py-10"
          />
        </GlassCard>
      ) : (
        <>
          <PageNav
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={onPageChange}
            noun="entries"
          />
          <ol className="space-y-3">
            {rows.map((row) => (
              <li key={row.id}>
                <GlassCard animateOnMount={false} isHoverLift={false} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={EVIDENCE_KIND_TONE[row.kind]}>
                          {EVIDENCE_KIND_LABELS[row.kind]}
                        </Badge>
                        <span className="text-sm font-medium tabular-nums">
                          {formatDate(row.occurred_on)}
                        </span>
                      </div>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {byId.get(row.albanian_tl)?.name ?? "Albanian team leader"}
                        {row.reporting_year ? ` · reporting ${row.reporting_year}` : ""}
                      </p>
                    </div>
                    <div className="text-muted-foreground flex items-center gap-2 text-xs">
                      {row.recorded_by_name ? (
                        <UserAvatar
                          name={row.recorded_by_name}
                          size="xs"
                          colorSeed={avatarSeed(row.recorded_by_name)}
                        />
                      ) : (
                        <FileClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      )}
                      <span>Recorded by {row.recorded_by_name ?? "—"}</span>
                    </div>
                  </div>

                  {row.shared_summary && (
                    <p className="mt-3 text-sm break-words whitespace-pre-line">
                      {row.shared_summary}
                    </p>
                  )}
                  {row.action_items && (
                    <div className="border-line-subtle bg-muted/40 mt-3 rounded-lg border p-3">
                      <p className="text-muted-foreground text-xs font-medium">Action items</p>
                      <p className="mt-1 text-sm break-words whitespace-pre-line">
                        {row.action_items}
                      </p>
                    </div>
                  )}
                  {row.reference_url && (
                    <a
                      href={row.reference_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-primary mt-3 inline-flex min-h-6 items-center gap-1.5 text-xs font-medium underline-offset-4 hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      Reference
                    </a>
                  )}
                </GlassCard>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
};
