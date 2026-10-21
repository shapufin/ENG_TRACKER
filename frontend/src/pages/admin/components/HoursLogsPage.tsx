import React, { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/PageShell";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { StatsCards } from "@/components/admin/StatsCards";
import { FilterToolbar } from "@/components/ui/FilterToolbar";
import { SearchInput, StatusChips, DateRangePickers } from "./filterBarParts";
import { HoursLogsTable } from "./HoursLogsTable";
import type { AppColumnDef } from "@/components/ui/tableTypes";

interface HoursLog {
  id: number;
  user_name?: string;
  user_tech_levels?: string[];
  date: string;
  hours: number;
  description?: string | null;
  status: string;
}

interface HoursLogsPageProps<T extends HoursLog> {
  title: string;
  subtitle: string;
  isLoading: boolean;
  error?: Error | null;
  errorMessage?: string;
  filterStatus: "all" | "pending" | "approved" | "rejected";
  setFilterStatus: (val: "all" | "pending" | "approved" | "rejected") => void;
  dateFrom: string;
  setDateFrom: (val: string) => void;
  dateTo: string;
  setDateTo: (val: string) => void;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  stats: { total: number; pending: number; approved: number; rejected: number };
  filteredLogs: T[];
  /** Rows matching the filters across every server page. */
  total: number;
  /** 1-based server page. */
  page: number;
  onPageChange: (page: number) => void;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onDelete?: (id: number) => void;
  canDelete?: boolean;
  extraColumns?: AppColumnDef<T>[];
  storageKey: string;
  /** Server-side CSV export of the current status/date filters; the button is hidden when omitted. */
  onExport?: () => void | Promise<void>;
  children?: React.ReactNode;
}

export const HoursLogsPage = <T extends HoursLog>({
  title,
  subtitle,
  isLoading,
  error,
  errorMessage,
  filterStatus,
  setFilterStatus,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  searchQuery,
  setSearchQuery,
  stats,
  filteredLogs,
  total,
  page,
  onPageChange,
  onApprove,
  onReject,
  onDelete,
  canDelete,
  extraColumns,
  storageKey,
  onExport,
  children,
}: HoursLogsPageProps<T>) => {
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    if (!onExport) return;
    setExporting(true);
    try {
      await onExport();
    } catch {
      /* the caller reports the failure (api error handler / toast) */
    } finally {
      setExporting(false);
    }
  };

  if (isLoading) return <LoadingCard rows={5} className="min-h-[300px]" />;
  if (error)
    return (
      <div className="text-destructive p-4">
        {errorMessage}: {String(error)}
      </div>
    );

  return (
    <PageShell
      title={title}
      subtitle={subtitle}
      actions={
        onExport && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleExport()}
            disabled={exporting}
            aria-busy={exporting}
            title="Exports the current status and date filters"
          >
            <Download className="mr-2 h-4 w-4" aria-hidden />
            Export CSV
          </Button>
        )
      }
    >
      <StatsCards
        total={stats.total}
        pending={stats.pending}
        approved={stats.approved}
        rejected={stats.rejected}
      />

      <HoursLogsTable
        header={
          <StatusChips
            filterStatus={filterStatus}
            onStatusChange={setFilterStatus}
            counts={stats}
          />
        }
        toolbar={
          <>
            <FilterToolbar.Search>
              <SearchInput value={searchQuery} onChange={setSearchQuery} />
            </FilterToolbar.Search>
            <div className="w-full sm:w-64">
              <DateRangePickers
                dateFrom={dateFrom}
                onDateFromChange={setDateFrom}
                dateTo={dateTo}
                onDateToChange={setDateTo}
              />
            </div>
          </>
        }
        logs={filteredLogs}
        server={{
          search: searchQuery,
          onSearchChange: setSearchQuery,
          page,
          total,
          onPageChange,
        }}
        extraColumns={extraColumns}
        onApprove={onApprove}
        onReject={onReject}
        onDelete={onDelete}
        canDelete={canDelete}
        storageKey={storageKey}
      />

      {children}
    </PageShell>
  );
};
