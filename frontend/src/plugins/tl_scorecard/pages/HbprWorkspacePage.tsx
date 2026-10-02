import React from "react";
import { useSearchParams } from "react-router-dom";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { PageShell } from "@/components/layout/PageShell";
import { NoAccess } from "../components/hbpr/NoAccess";
import { isForbidden } from "../components/hbpr/isForbidden";
import { AssignedLeadersTable } from "../components/hbpr/AssignedLeadersTable";
import { HbprAttentionSummary } from "../components/hbpr/HbprAttentionSummary";
import { HbprEvidenceTimeline } from "../components/hbpr/HbprEvidenceTimeline";
import { HbprRecordExplorer, type HbprRecordFilters } from "../components/hbpr/HbprRecordExplorer";
import { HbprWorkspaceEmptyState } from "../components/hbpr/HbprWorkspaceEmptyState";
import { HbprWorkspaceHeader, type HbprView } from "../components/hbpr/HbprWorkspaceHeader";
import {
  evidenceForYear,
  HBPR_RECORD_KINDS,
  resourceFromKind,
  useHbprWorkspaceQueries,
} from "../hooks/useHbprWorkspaceQueries";

const VIEWS: HbprView[] = ["overview", "leaders", "records", "evidence"];

const Skeleton: React.FC = () => (
  <div aria-busy="true" className="space-y-3">
    <span className="sr-only">Loading the HBPR workspace…</span>
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="bg-muted/40 h-28 animate-pulse rounded-xl border" />
      ))}
    </div>
    <div className="bg-muted/40 h-40 animate-pulse rounded-xl border" />
  </div>
);

export const HbprWorkspacePage: React.FC = () => {
  const [params, setParams] = useSearchParams();

  const viewParam = params.get("view");
  const view: HbprView = VIEWS.includes(viewParam as HbprView)
    ? (viewParam as HbprView)
    : "overview";
  // Match the API's own bounds (integer, 2000–2100) so a hand-edited `?year=`
  // falls back to the current year instead of a generic 400 error card.
  const yearParam = Number(params.get("year"));
  const year =
    Number.isInteger(yearParam) && yearParam >= 2000 && yearParam <= 2100
      ? yearParam
      : new Date().getFullYear();
  const leaderParam = Number(params.get("leader")) || null;

  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true }
    );

  const { overview, evidence, records } = useHbprWorkspaceQueries({
    year,
    includeRecords: view === "records",
  });

  const leaders = overview.data?.leaders ?? [];
  // An out-of-scope `?leader=` id is dropped rather than trusted: the API would
  // 403 the export, and the filters would show a permanently empty list.
  const leader = leaders.some((l) => l.id === leaderParam) ? leaderParam : null;
  const exportLeaderId = leader ?? leaders[0]?.id;
  const filters: HbprRecordFilters = {
    // `kind` is the shared deep-link vocabulary (see HBPR_RECORD_KINDS).
    resource: resourceFromKind(params.get("kind")),
    leader,
    status: params.get("status") ?? "",
    period: params.get("period") ?? "",
  };

  if (overview.isError) {
    return (
      <PageShell title="HBPR Workspace">
        {isForbidden(overview.error) ? (
          <NoAccess />
        ) : (
          <ErrorCard title="Could not load the workspace" onRetry={() => void overview.refetch()} />
        )}
      </PageShell>
    );
  }

  if (overview.isLoading || !overview.data) {
    // Keep the header (period selector, views) mounted so the skeleton occupies
    // the final geometry instead of the layout shifting when data lands.
    return (
      <HbprWorkspaceHeader
        view={view}
        onViewChange={(next) => setParam("view", next === "overview" ? null : next)}
        year={year}
        onYearChange={(next) => setParam("year", String(next))}
      >
        <Skeleton />
      </HbprWorkspaceHeader>
    );
  }

  if (leaders.length === 0) {
    return (
      <HbprWorkspaceHeader
        view={view}
        onViewChange={(next) => setParam("view", next === "overview" ? null : next)}
        year={year}
        onYearChange={(next) => setParam("year", String(next))}
      >
        <HbprWorkspaceEmptyState />
      </HbprWorkspaceHeader>
    );
  }

  const evidenceRows = evidenceForYear(evidence.data ?? [], year);

  return (
    <HbprWorkspaceHeader
      view={view}
      onViewChange={(next) => setParam("view", next === "overview" ? null : next)}
      year={year}
      onYearChange={(next) => setParam("year", String(next))}
      exportLeaderId={exportLeaderId}
      exportLeaderName={leaders.find((l) => l.id === exportLeaderId)?.name}
    >
      {view === "overview" && (
        <>
          <HbprAttentionSummary
            attention={overview.data.needs_attention}
            recentDays={overview.data.recent_evidence_days}
            year={year}
          />
          <AssignedLeadersTable leaders={leaders} year={year} />
        </>
      )}

      {view === "leaders" && <AssignedLeadersTable leaders={leaders} year={year} />}

      {view === "records" && (
        <HbprRecordExplorer
          rows={records.data ?? []}
          leaders={leaders}
          filters={filters}
          onFilterChange={(key, value) =>
            setParam(
              key === "resource" ? "kind" : key,
              value === null || value === ""
                ? null
                : key === "resource"
                  ? HBPR_RECORD_KINDS[value as keyof typeof HBPR_RECORD_KINDS]
                  : String(value)
            )
          }
          onReset={() =>
            setParams(
              (prev) => {
                const next = new URLSearchParams(prev);
                ["kind", "leader", "status", "period"].forEach((k) => next.delete(k));
                return next;
              },
              { replace: true }
            )
          }
          isLoading={records.isLoading}
          isError={records.isError}
          onRetry={() => void records.refetch()}
        />
      )}

      {view === "evidence" && (
        <HbprEvidenceTimeline
          evidence={evidenceRows}
          leaders={leaders}
          year={year}
          leaderFilter={leader}
          onLeaderFilterChange={(id) => setParam("leader", id === null ? null : String(id))}
          isLoading={evidence.isLoading}
          isError={evidence.isError}
          onRetry={() => void evidence.refetch()}
        />
      )}
    </HbprWorkspaceHeader>
  );
};
