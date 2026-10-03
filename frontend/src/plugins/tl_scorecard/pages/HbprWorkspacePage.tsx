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
  DEFAULT_RECORD_RESOURCE,
  HBPR_EVIDENCE_PAGE_SIZE,
  HBPR_RECORD_KINDS,
  HBPR_RECORD_PAGE_SIZE,
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
  const page = Math.max(1, Math.trunc(Number(params.get("page"))) || 1);

  // Changing anything but the page itself returns to page one.
  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key !== "page") next.delete("page");
        return next;
      },
      { replace: true }
    );

  const filters = {
    // `kind` is the shared deep-link vocabulary (see HBPR_RECORD_KINDS); the API
    // pages one kind at a time, so one is always selected.
    resource: resourceFromKind(params.get("kind")) ?? DEFAULT_RECORD_RESOURCE,
    status: params.get("status") ?? "",
    period: params.get("period") ?? "",
  };

  const { overview, evidence, records, leader } = useHbprWorkspaceQueries({
    year,
    view,
    leaderParam,
    record: { ...filters, page },
    evidencePage: page,
  });

  const leaders = overview.data?.leaders ?? [];
  const exportLeaderId = leader ?? leaders[0]?.id;
  const recordFilters: HbprRecordFilters = { ...filters, leader };
  const headerProps = {
    view,
    onViewChange: (next: HbprView) => setParam("view", next === "overview" ? null : next),
    year,
    onYearChange: (next: number) => setParam("year", String(next)),
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
      <HbprWorkspaceHeader {...headerProps}>
        <Skeleton />
      </HbprWorkspaceHeader>
    );
  }

  if (leaders.length === 0) {
    return (
      <HbprWorkspaceHeader {...headerProps}>
        <HbprWorkspaceEmptyState />
      </HbprWorkspaceHeader>
    );
  }

  return (
    <HbprWorkspaceHeader
      {...headerProps}
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
          rows={records.data?.rows ?? []}
          total={records.data?.count ?? 0}
          page={page}
          pageSize={HBPR_RECORD_PAGE_SIZE}
          onPageChange={(next) => setParam("page", next > 1 ? String(next) : null)}
          leaders={leaders}
          filters={recordFilters}
          onFilterChange={(key, value) => {
            if (key === "resource") {
              // A status of one kind means nothing for another.
              setParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  next.set("kind", HBPR_RECORD_KINDS[value as keyof typeof HBPR_RECORD_KINDS]);
                  next.delete("status");
                  next.delete("page");
                  return next;
                },
                { replace: true }
              );
              return;
            }
            setParam(key, value === null || value === "" ? null : String(value));
          }}
          onReset={() =>
            setParams(
              (prev) => {
                const next = new URLSearchParams(prev);
                ["leader", "status", "period", "page"].forEach((k) => next.delete(k));
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
          evidence={evidence.data?.rows ?? []}
          total={evidence.data?.count ?? 0}
          page={page}
          pageSize={HBPR_EVIDENCE_PAGE_SIZE}
          onPageChange={(next) => setParam("page", next > 1 ? String(next) : null)}
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
