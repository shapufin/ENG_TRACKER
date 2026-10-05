import React from "react";
import { Link } from "react-router-dom";
import { FilterX, ScrollText, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { UserAvatar } from "@/components/calendar/UserAvatar";
import {
  HBPR_RECORD_RESOURCES,
  HBPR_RECORD_STATUSES,
  HBPR_RECORD_KINDS,
  type HbprRecordResource,
  type HbprRecordRow,
} from "../../hooks/useHbprWorkspaceQueries";
import type { HbprLeaderRow } from "../../types/tlScorecard";
import { avatarSeed } from "../avatarSeed";
import { formatDate, HBPR_RESOURCE_ICONS, HBPR_RESOURCE_NOUNS } from "./hbprMeta";
import { toneTextClass } from "@/components/ui/tone";
import { TABLE_HEAD_CELL_CLASS, TABLE_HEAD_ROW_CLASS } from "@/components/ui/tableStyles";
import { cn } from "@/lib/utils";
import { hbprRecordState } from "./hbprRecordState";
import { HbprRecordsCsvButton } from "./HbprRecordsCsvButton";
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
  /** Server-side text search across every page (same `?q=` as the endpoints). */
  q: string;
}

interface HbprRecordExplorerProps {
  /** The current server page of rows. */
  rows: HbprRecordRow[];
  total: number;
  /** Per-kind server counts for the sidebar (leader + period scope). */
  counts: Record<string, number> | null;
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
  counts,
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
  const hasFilters =
    filters.leader !== null || filters.status !== "" || filters.period !== "" || filters.q !== "";
  const noun = HBPR_RESOURCE_NOUNS[filters.resource];

  const resourceLabel = (resource: HbprRecordResource) =>
    HBPR_RECORD_RESOURCES.find((r) => r.value === resource)?.label ?? resource;
  const cardTitle = `${resourceLabel(filters.resource)} Records`;

  let latest: HbprRecordRow | null = null;
  for (const row of rows) {
    if (row.detail === "—") continue;
    if (!latest || row.date > latest.date) latest = row;
  }
  // The history link keeps kind + leader and drops period + status: the full
  // history of this kind, not a second empty filtered view.
  const historyHref =
    `?view=records&kind=${HBPR_RECORD_KINDS[filters.resource]}` +
    (filters.leader !== null ? `&leader=${filters.leader}` : "");

  return (
    <section aria-label="Governance records" className="space-y-4">
      <GlassCard animateOnMount={false} isHoverLift={false} className="p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid grow gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            <div>
              <Label htmlFor="hbpr-filter-search">Search</Label>
              <div className="relative mt-1.5">
                <Search
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2"
                  aria-hidden="true"
                />
                <Input
                  id="hbpr-filter-search"
                  type="search"
                  aria-label="Search records"
                  placeholder="Search all records…"
                  className="pl-8"
                  value={filters.q}
                  onChange={(e) => onFilterChange("q", e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <HbprRecordsCsvButton
              kind={HBPR_RECORD_KINDS[filters.resource]}
              leader={filters.leader}
              status={filters.status}
              period={filters.period}
              q={filters.q}
            />
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={onReset}>
                <FilterX className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Clear filters
              </Button>
            )}
          </div>
        </div>
      </GlassCard>

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
          <GlassCard animateOnMount={false} isHoverLift={false} className="hidden p-3 lg:block">
            <p className="text-muted-foreground px-3 py-2 text-xs font-bold tracking-wider uppercase">
              Record types
            </p>
            <ul className="space-y-1.5">
              {HBPR_RECORD_RESOURCES.map((r) => {
                const active = r.value === filters.resource;
                // The summary is keyed by the shared kind vocabulary and takes
                // no ?status= (per-kind vocabularies); until it loads, the
                // active kind falls back to its own page total.
                const count = counts?.[HBPR_RECORD_KINDS[r.value]] ?? (active ? total : null);
                const Icon = HBPR_RESOURCE_ICONS[r.value].icon;
                const tone = HBPR_RESOURCE_ICONS[r.value].tone;
                return (
                  <li key={r.value}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => onFilterChange("resource", r.value)}
                      className={`group flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-colors ${
                        active
                          ? "bg-foreground text-background font-semibold shadow-sm"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 ${toneTextClass[tone]}`}
                        aria-hidden="true"
                      />
                      <span className="truncate">{r.label}</span>{" "}
                      {count !== null && (
                        <span
                          className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                            active
                              ? "bg-background/20 text-background"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </GlassCard>
        </nav>

        <div className="min-w-0">
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
            <GlassCard animateOnMount={false} isHoverLift={false} className="overflow-hidden p-0">
              <div className="border-line-subtle flex items-center justify-between gap-3 border-b px-5 py-3.5">
                <h2 className="text-foreground flex items-center gap-2 text-sm font-bold tracking-wider uppercase">
                  {cardTitle}
                  <span
                    className="bg-tone-success-text h-1.5 w-1.5 rounded-full"
                    aria-hidden="true"
                  />
                </h2>
                <span className="text-muted-foreground text-xs">Showing 0 of {total} records</span>
              </div>
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
            <div className="space-y-4">
              <ul className="grid gap-3 md:hidden">
                {rows.map((row) => (
                  <li key={row.key}>
                    <GlassCard animateOnMount={false} isHoverLift={false} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <UserAvatar
                            name={row.subject}
                            size="sm"
                            colorSeed={avatarSeed(row.subject)}
                          />
                          <div className="min-w-0">
                            <p className="truncate font-medium" title={row.subject}>
                              {row.subject}
                            </p>
                            <p className="text-muted-foreground mt-0.5 text-xs">
                              {resourceLabel(row.resource)} · {formatDate(row.date)}
                            </p>
                          </div>
                        </div>
                        <StateBadge {...hbprRecordState(row.resource, row.status, row.date)} />
                      </div>
                      <p className="text-muted-foreground mt-2 text-xs break-words">{row.detail}</p>
                    </GlassCard>
                  </li>
                ))}
              </ul>

              <GlassCard
                animateOnMount={false}
                isHoverLift={false}
                className="hidden overflow-hidden p-0 md:block"
              >
                <div className="border-line-subtle flex items-center justify-between gap-3 border-b px-5 py-3.5">
                  <h2 className="text-foreground flex items-center gap-2 text-sm font-bold tracking-wider uppercase">
                    {cardTitle}
                    <span
                      className="bg-tone-success-text h-1.5 w-1.5 rounded-full"
                      aria-hidden="true"
                    />
                  </h2>
                  <span className="text-muted-foreground text-xs">
                    Showing {rows.length} of {total} records
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Governance records in your assigned scope</caption>
                    <thead>
                      <tr className={TABLE_HEAD_ROW_CLASS}>
                        <th scope="col" className={cn(TABLE_HEAD_CELL_CLASS, "py-2")}>
                          Date
                        </th>
                        <th scope="col" className={cn(TABLE_HEAD_CELL_CLASS, "py-2")}>
                          Type
                        </th>
                        <th scope="col" className={cn(TABLE_HEAD_CELL_CLASS, "py-2")}>
                          With
                        </th>
                        <th scope="col" className={cn(TABLE_HEAD_CELL_CLASS, "py-2")}>
                          Focus / Notes preview
                        </th>
                        <th scope="col" className={cn(TABLE_HEAD_CELL_CLASS, "py-2")}>
                          State
                        </th>
                        <th scope="col" className={cn(TABLE_HEAD_CELL_CLASS, "py-2")}>
                          Owner
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-border/50 divide-y">
                      {rows.map((row) => (
                        <tr key={row.key}>
                          <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap tabular-nums">
                            {formatDate(row.date)}
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge variant="neutral" className="whitespace-nowrap">
                              {resourceLabel(row.resource)}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <UserAvatar
                                name={row.subject}
                                size="sm"
                                colorSeed={avatarSeed(row.subject)}
                              />
                              <span
                                className="max-w-[10rem] truncate font-medium"
                                title={row.subject}
                              >
                                {row.subject}
                              </span>
                            </div>
                          </td>
                          <td
                            className="text-muted-foreground max-w-[20rem] truncate px-4 py-2.5"
                            title={row.detail}
                          >
                            {row.detail}
                          </td>
                          <td className="px-4 py-2.5">
                            <StateBadge {...hbprRecordState(row.resource, row.status, row.date)} />
                          </td>
                          <td
                            className="text-muted-foreground max-w-[8rem] truncate px-4 py-2.5 text-xs"
                            title={row.owner_name}
                          >
                            {row.owner_name}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {latest && (
                  <div className="border-line-subtle bg-muted/40 flex flex-col gap-3 border-t px-5 py-4 text-xs md:flex-row md:items-center md:justify-between">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span className="border-border bg-card text-muted-foreground rounded-md border p-1">
                        <ScrollText className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-foreground font-bold">
                          Latest {noun} ({latest.subject}):
                        </p>
                        <p
                          className="text-muted-foreground mt-0.5 line-clamp-2 italic"
                          title={latest.detail}
                        >
                          &ldquo;{latest.detail}&rdquo;
                        </p>
                      </div>
                    </div>
                    <Link
                      to={historyHref}
                      className="text-primary inline-flex min-h-6 shrink-0 items-center font-semibold"
                    >
                      View full {noun} history →
                    </Link>
                  </div>
                )}
                <div className="border-line-subtle border-t px-5 py-3">
                  <PageNav
                    page={page}
                    pageSize={pageSize}
                    total={total}
                    onPageChange={onPageChange}
                    noun="records"
                  />
                </div>
              </GlassCard>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
