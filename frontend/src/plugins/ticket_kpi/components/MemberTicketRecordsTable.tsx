import React, { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Search, RotateCcw, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTicketKPITickets } from "../pages/hooks/useTicketKPITickets";
import type { TicketQueryFilters, TicketRecord } from "../types/ticketKPI";

interface MemberTicketRecordsTableProps {
  /** Single month (YYYY-MM-DD). Mutually exclusive with `year`. */
  month?: string;
  /** Full year (YYYY). Mutually exclusive with `month`. */
  year?: number;
  userId?: number;
  /** When false the query is disabled (e.g. no data context). */
  enabled?: boolean;
}

// Standard fields rendered with friendly formatting. Everything else falls
// back to the raw uploaded value from `raw_data`.
const STANDARD_FIELDS = [
  "ticket_id",
  "title",
  "status",
  "priority",
  "category",
  "assignee",
  "requester",
  "created_at",
  "resolved_at",
  "time_to_resolution_hours",
  "sla_breached",
] as const;

const FIELD_LABELS: Record<string, string> = {
  ticket_id: "Ticket ID",
  title: "Title",
  status: "Status",
  priority: "Priority",
  category: "Category",
  assignee: "Assignee",
  requester: "Requester",
  created_at: "Created",
  resolved_at: "Resolved",
  time_to_resolution_hours: "Resolution (h)",
  sla_breached: "SLA",
};

/** Fields with dedicated filter dropdowns (not rendered as dynamic filters). */
const STANDARD_FILTER_KEYS = new Set(["status", "priority", "category", "assignee", "requester"]);

const labelFor = (field: string): string =>
  FIELD_LABELS[field] ?? field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const formatDateTime = (value: string | null): string => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  closed: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  open: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  approved: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  rejected: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  cancelled: "bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30",
};

const renderStatusCell = (row: TicketRecord): React.ReactNode => {
  const cls =
    STATUS_BADGE_CLASS[row.status?.toLowerCase()] ?? "bg-muted text-muted-foreground border-border";
  return row.status ? (
    <Badge variant="outline" className={cn("font-medium", cls)}>
      {row.status}
    </Badge>
  ) : (
    "—"
  );
};

const renderSlaCell = (row: TicketRecord): React.ReactNode => {
  if (row.sla_breached === null || row.sla_breached === undefined) return "—";
  return row.sla_breached ? (
    <Badge variant="outline" className="border-rose-500/30 bg-rose-500/15 text-rose-600">
      Breached
    </Badge>
  ) : (
    <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/15 text-emerald-600">
      OK
    </Badge>
  );
};

const renderDefaultCell = (field: string, row: TicketRecord): React.ReactNode => {
  if (STANDARD_FIELDS.includes(field as (typeof STANDARD_FIELDS)[number])) {
    const value = row[field as keyof TicketRecord];
    return value === "" || value == null ? "—" : String(value);
  }
  const raw = row.raw_data?.[field];
  if (raw === null || raw === undefined || raw === "") return "—";
  return typeof raw === "object" ? JSON.stringify(raw) : String(raw);
};

const renderCell = (field: string, row: TicketRecord): React.ReactNode => {
  switch (field) {
    case "status":
      return renderStatusCell(row);
    case "sla_breached":
      return renderSlaCell(row);
    case "created_at":
    case "resolved_at":
      return formatDateTime(row[field]);
    case "time_to_resolution_hours":
      return row.time_to_resolution_hours != null
        ? `${row.time_to_resolution_hours.toFixed(1)}h`
        : "—";
    case "title":
      return (
        <span className="max-w-[280px] truncate" title={row.title}>
          {row.title || "—"}
        </span>
      );
    default:
      return renderDefaultCell(field, row);
  }
};

const ALL = "__all__";

const FilterSelect: React.FC<{
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}> = ({ label, value, options, onChange }) => (
  <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
    <SelectTrigger className="h-9 w-[150px]">
      <SelectValue placeholder={label} />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value={ALL}>All {label}</SelectItem>
      {options.map((opt) => (
        <SelectItem key={opt} value={opt}>
          {opt}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

type FilterBarProps = {
  filters: TicketQueryFilters;
  filterOptions: Record<string, string[]>;
  dynamicFilterKeys: string[];
  hasActiveFilters: boolean;
  updateFilter: <K extends keyof TicketQueryFilters>(key: K, value: TicketQueryFilters[K]) => void;
  updateDynamicField: (field: string, value: string) => void;
  resetFilters: () => void;
};

const TicketRecordsFilterBar: React.FC<FilterBarProps> = ({
  filters,
  filterOptions,
  dynamicFilterKeys,
  hasActiveFilters,
  updateFilter,
  updateDynamicField,
  resetFilters,
}) => (
  <div className="flex flex-wrap items-center gap-2">
    <div className="relative max-w-xs flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Search ticket id, title, assignee…"
        value={filters.search ?? ""}
        onChange={(e) => updateFilter("search", e.target.value)}
        className="h-9 pl-9"
      />
    </div>
    {(["status", "priority", "category", "assignee", "requester"] as const).map((field) => (
      <FilterSelect
        key={field}
        label={field}
        value={filters[field] ?? ""}
        options={filterOptions[field] ?? []}
        onChange={(v) => updateFilter(field, v)}
      />
    ))}
    <Select
      value={filters.sla_breached === undefined ? ALL : String(filters.sla_breached)}
      onValueChange={(v) => updateFilter("sla_breached", v === ALL ? undefined : v === "true")}
    >
      <SelectTrigger className="h-9 w-[150px]">
        <SelectValue placeholder="SLA" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All SLA</SelectItem>
        <SelectItem value="true">SLA breached</SelectItem>
        <SelectItem value="false">Within SLA</SelectItem>
      </SelectContent>
    </Select>
    {/* Dynamic field filters (e.g. operatore, caller, etc.) */}
    {dynamicFilterKeys.map((field) => (
      <FilterSelect
        key={field}
        label={field.replace(/_/g, " ")}
        value={filters.dynamicFields?.[field] ?? ""}
        options={filterOptions[field] ?? []}
        onChange={(v) => updateDynamicField(field, v)}
      />
    ))}
    {hasActiveFilters && (
      <Button variant="ghost" size="sm" onClick={resetFilters} className="h-9">
        <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
      </Button>
    )}
  </div>
);

type TableBodyProps = {
  columns: string[];
  results: TicketRecord[];
  isLoading: boolean;
  isError: boolean;
  hasActiveFilters: boolean;
};

const TicketRecordsTableBody: React.FC<TableBodyProps> = ({
  columns,
  results,
  isLoading,
  isError,
  hasActiveFilters,
}) => (
  <tbody className="divide-y divide-border/30">
    {isLoading ? (
      <tr>
        <td colSpan={columns.length} className="px-4 py-10 text-center text-muted-foreground">
          Loading tickets…
        </td>
      </tr>
    ) : isError ? (
      <tr>
        <td colSpan={columns.length} className="px-4 py-10 text-center text-muted-foreground">
          Failed to load ticket records. Try adjusting filters or reloading.
        </td>
      </tr>
    ) : results.length === 0 ? (
      <tr>
        <td colSpan={columns.length} className="px-4 py-12 text-center">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Inbox className="h-8 w-8 opacity-30" />
            <p className="text-sm">
              {hasActiveFilters
                ? "No tickets match the current filters."
                : "No ticket records for this month."}
            </p>
          </div>
        </td>
      </tr>
    ) : (
      results.map((row) => (
        <tr key={row.id} className="transition-colors hover:bg-muted/25">
          {columns.map((field) => (
            <td key={field} className="px-4 py-3 align-middle">
              {renderCell(field, row)}
            </td>
          ))}
        </tr>
      ))
    )}
  </tbody>
);

type PaginationProps = {
  page: number;
  pageSize: number;
  pageSizeOptions: number[];
  totalCount: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  isFetching: boolean;
  isLoading: boolean;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
};

const TicketRecordsPagination: React.FC<PaginationProps> = ({
  page,
  pageSize,
  pageSizeOptions,
  totalCount,
  totalPages,
  rangeStart,
  rangeEnd,
  isFetching,
  isLoading,
  setPage,
  setPageSize,
}) => (
  <div className="flex flex-wrap items-center justify-between gap-3 px-1">
    <p className="text-xs text-muted-foreground">
      {totalCount === 0 ? "0 results" : `Showing ${rangeStart}–${rangeEnd} of ${totalCount}`}
      {isFetching && !isLoading && " · updating…"}
    </p>
    <div className="flex items-center gap-2">
      <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
        <SelectTrigger className="h-8 w-[110px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {pageSizeOptions.map((size) => (
            <SelectItem key={size} value={String(size)}>
              {size} / page
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        className="h-8"
        disabled={page <= 1}
        onClick={() => setPage(page - 1)}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-xs tabular-nums text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      <Button
        variant="outline"
        size="sm"
        className="h-8"
        disabled={page >= totalPages}
        onClick={() => setPage(page + 1)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  </div>
);

export const MemberTicketRecordsTable: React.FC<MemberTicketRecordsTableProps> = ({
  month,
  year,
  userId,
  enabled = true,
}) => {
  const {
    data,
    isLoading,
    isFetching,
    isError,
    page,
    setPage,
    pageSize,
    setPageSize,
    pageSizeOptions,
    filters,
    updateFilter,
    updateDynamicField,
    resetFilters,
    availableFields,
    filterOptions,
    totalCount,
    totalPages,
  } = useTicketKPITickets({ month, year, userId, enabled });

  // Order columns: standard fields first (in canonical order), then extras.
  const columns = useMemo(() => {
    const extras = availableFields.filter(
      (f) => !STANDARD_FIELDS.includes(f as (typeof STANDARD_FIELDS)[number])
    );
    return [...STANDARD_FIELDS, ...extras];
  }, [availableFields]);

  // Dynamic field filters: keys in filterOptions that aren't standard filter fields
  const dynamicFilterKeys = useMemo(
    () =>
      Object.keys(filterOptions).filter(
        (k) => !STANDARD_FILTER_KEYS.has(k) && filterOptions[k] && filterOptions[k].length > 0
      ),
    [filterOptions]
  );

  const results = data?.results ?? [];
  const hasActiveFilters = !!(
    filters.status ||
    filters.priority ||
    filters.category ||
    filters.assignee ||
    filters.requester ||
    filters.search ||
    filters.sla_breached !== undefined ||
    (filters.dynamicFields && Object.values(filters.dynamicFields).some((v) => v))
  );

  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalCount);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold">Ticket Records</h3>
        <p className="text-xs text-muted-foreground">
          Every uploaded ticket for this month. Columns are discovered automatically from the
          uploaded file. Filter, search, and paginate server-side.
        </p>
      </div>

      {/* Filter bar */}
      <TicketRecordsFilterBar
        filters={filters}
        filterOptions={filterOptions}
        dynamicFilterKeys={dynamicFilterKeys}
        hasActiveFilters={hasActiveFilters}
        updateFilter={updateFilter}
        updateDynamicField={updateDynamicField}
        resetFilters={resetFilters}
      />

      {/* Table */}
      <GlassCard isHoverLift={false} className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="border-b border-border/70 bg-muted/40">
                {columns.map((field) => (
                  <th
                    key={field}
                    className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {labelFor(field)}
                  </th>
                ))}
              </tr>
            </thead>
            <TicketRecordsTableBody
              columns={columns}
              results={results}
              isLoading={isLoading}
              isError={isError}
              hasActiveFilters={hasActiveFilters}
            />
          </table>
        </div>
      </GlassCard>

      {/* Server-side pagination */}
      <TicketRecordsPagination
        page={page}
        pageSize={pageSize}
        pageSizeOptions={pageSizeOptions}
        totalCount={totalCount}
        totalPages={totalPages}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        isFetching={isFetching}
        isLoading={isLoading}
        setPage={setPage}
        setPageSize={setPageSize}
      />
    </div>
  );
};
