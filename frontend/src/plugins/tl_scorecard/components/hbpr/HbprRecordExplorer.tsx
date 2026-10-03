import React from "react";
import { FilterX, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  HBPR_RECORD_RESOURCES,
  HBPR_RECORD_STATUSES,
  type HbprRecordResource,
  type HbprRecordRow,
} from "../../hooks/useHbprWorkspaceQueries";
import type { HbprLeaderRow } from "../../types/tlScorecard";
import { formatDate } from "./hbprMeta";
import { hbprRecordState } from "./hbprRecordState";
import { StateBadge } from "../records/StateBadge";
import { PageNav } from "./PageNav";

const ALL = "all";

export interface HbprRecordFilters {
  /** One kind is always selected: the API pages a single record type at a time. */
  resource: HbprRecordResource;
  leader: number | null;
  status: string;
  /** YYYY-MM, or "" for every period. */
  period: string;
}

interface HbprRecordExplorerProps {
  /** The current server page of rows. */
  rows: HbprRecordRow[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  leaders: HbprLeaderRow[];
  filters: HbprRecordFilters;
  onFilterChange: <K extends keyof HbprRecordFilters>(key: K, value: HbprRecordFilters[K]) => void;
  onReset: () => void;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

/** Read-only explorer over the HBPR's governance records (never employee 1:1s). */
export const HbprRecordExplorer: React.FC<HbprRecordExplorerProps> = ({
  rows,
  total,
  page,
  pageSize,
  onPageChange,
  leaders,
  filters,
  onFilterChange,
  onReset,
  isLoading,
  isError,
  onRetry,
}) => {
  const statuses = HBPR_RECORD_STATUSES[filters.resource];
  const hasFilters = filters.leader !== null || filters.status !== "" || filters.period !== "";

  const resourceLabel = (resource: HbprRecordResource) =>
    HBPR_RECORD_RESOURCES.find((r) => r.value === resource)?.label ?? resource;

  return (
    <section aria-labelledby="hbpr-records" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="hbpr-records" className="text-muted-foreground text-sm font-semibold">
          Governance records
        </h2>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={onReset}>
            <FilterX className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Clear filters
          </Button>
        )}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="Record types" className="min-w-0">
          <div className="lg:hidden">
            <Label htmlFor="hbpr-kind">Record type</Label>
            <Select
              value={filters.resource}
              onValueChange={(v) => onFilterChange("resource", v as HbprRecordResource)}
            >
              <SelectTrigger id="hbpr-kind" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HBPR_RECORD_RESOURCES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Per-kind totals would cost one request per kind; the API pages a
              single kind at a time, so only the active kind shows its server total. */}
          <GlassCard animateOnMount={false} isHoverLift={false} className="hidden p-2 lg:block">
            <ul className="space-y-0.5">
              {HBPR_RECORD_RESOURCES.map((r) => {
                const active = r.value === filters.resource;
                return (
                  <li key={r.value}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => onFilterChange("resource", r.value)}
                      className={`flex min-h-9 w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-sm ${
                        active
                          ? "bg-muted text-foreground font-semibold"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      }`}
                    >
                      {r.label} {active && <span className="text-xs tabular-nums">{total}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </GlassCard>
        </nav>

        <div className="min-w-0 space-y-3">
          <GlassCard animateOnMount={false} isHoverLift={false} className="p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label htmlFor="hbpr-filter-leader">Albanian team leader</Label>
                <Select
                  value={filters.leader === null ? ALL : String(filters.leader)}
                  onValueChange={(v) => onFilterChange("leader", v === ALL ? null : Number(v))}
                >
                  <SelectTrigger id="hbpr-filter-leader" className="mt-1.5">
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

              {statuses.length > 0 && (
                <div>
                  <Label htmlFor="hbpr-filter-status">Status</Label>
                  <Select
                    value={filters.status === "" ? ALL : filters.status}
                    onValueChange={(v) => onFilterChange("status", v === ALL ? "" : v)}
                  >
                    <SelectTrigger id="hbpr-filter-status" className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>All statuses</SelectItem>
                      {statuses.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label htmlFor="hbpr-filter-period">Period</Label>
                <Input
                  id="hbpr-filter-period"
                  type="month"
                  className="mt-1.5"
                  value={filters.period}
                  onChange={(e) => onFilterChange("period", e.target.value)}
                />
              </div>
            </div>
          </GlassCard>

          {isError ? (
            <ErrorCard title="Could not load governance records" onRetry={onRetry} />
          ) : isLoading ? (
            <div aria-busy="true" className="space-y-2">
              <span className="sr-only">Loading governance records…</span>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-muted/40 h-14 animate-pulse rounded-xl border" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <GlassCard animateOnMount={false} isHoverLift={false} className="p-0">
              <EmptyState
                icon={ScrollText}
                title={hasFilters ? "No records match these filters" : "No governance records yet"}
                description={
                  hasFilters
                    ? "Adjust or clear the filters to see more."
                    : "Records your assigned team leaders register will appear here."
                }
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
                noun="records"
              />

              <ul className="grid gap-3 md:hidden">
                {rows.map((row) => (
                  <li key={row.key}>
                    <GlassCard animateOnMount={false} isHoverLift={false} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium" title={row.subject}>
                            {row.subject}
                          </p>
                          <p className="text-muted-foreground mt-0.5 text-xs">
                            {resourceLabel(row.resource)} · {formatDate(row.date)}
                          </p>
                        </div>
                        <StateBadge {...hbprRecordState(row.resource, row.status, row.date)} />
                      </div>
                      <p className="text-muted-foreground mt-2 text-xs break-words">{row.detail}</p>
                      <p className="text-muted-foreground mt-2 text-xs">Owner: {row.owner_name}</p>
                    </GlassCard>
                  </li>
                ))}
              </ul>

              <GlassCard animateOnMount={false} isHoverLift={false} className="hidden p-0 md:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Governance records in your assigned scope</caption>
                    <thead>
                      <tr className="border-border/60 text-muted-foreground border-b text-xs tracking-wide uppercase">
                        <th scope="col" className="px-4 py-2.5 font-medium">
                          Record
                        </th>
                        <th scope="col" className="px-4 py-2.5 font-medium">
                          Type
                        </th>
                        <th scope="col" className="px-4 py-2.5 font-medium">
                          Status
                        </th>
                        <th scope="col" className="px-4 py-2.5 font-medium">
                          Date
                        </th>
                        <th scope="col" className="px-4 py-2.5 font-medium">
                          Owner
                        </th>
                        <th scope="col" className="px-4 py-2.5 font-medium">
                          Detail
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-border/50 divide-y">
                      {rows.map((row) => (
                        <tr key={row.key}>
                          <th
                            scope="row"
                            className="max-w-[12rem] truncate px-4 py-2.5 font-medium"
                            title={row.subject}
                          >
                            {row.subject}
                          </th>
                          <td className="text-muted-foreground px-4 py-2.5">
                            {resourceLabel(row.resource)}
                          </td>
                          <td className="px-4 py-2.5">
                            <StateBadge {...hbprRecordState(row.resource, row.status, row.date)} />
                          </td>
                          <td className="px-4 py-2.5 tabular-nums">{formatDate(row.date)}</td>
                          <td className="max-w-[10rem] truncate px-4 py-2.5" title={row.owner_name}>
                            {row.owner_name}
                          </td>
                          <td
                            className="text-muted-foreground max-w-[20rem] truncate px-4 py-2.5"
                            title={row.detail}
                          >
                            {row.detail}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassCard>
            </>
          )}
        </div>
      </div>
    </section>
  );
};
