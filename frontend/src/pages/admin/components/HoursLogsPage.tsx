import React from "react";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { StatsCards } from "@/components/admin/StatsCards";
import { FilterBar } from "./FilterBar";
import { HoursLogsTable } from "./HoursLogsTable";
import type { ColumnDef } from "@tanstack/react-table";

interface HoursLog {
  id: number;
  user_name?: string;
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
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onDelete?: (id: number) => void;
  canDelete?: boolean;
  extraColumns?: ColumnDef<T>[];
  storageKey: string;
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
  onApprove,
  onReject,
  onDelete,
  canDelete,
  extraColumns,
  storageKey,
  children,
}: HoursLogsPageProps<T>) => {
  if (isLoading) return <LoadingCard rows={5} className="min-h-[300px]" />;
  if (error)
    return (
      <div className="p-4 text-destructive">
        {errorMessage}: {String(error)}
      </div>
    );

  return (
    <PageShell title={title} subtitle={subtitle} category="Workforce Management">
      <StatsCards
        total={stats.total}
        pending={stats.pending}
        approved={stats.approved}
        rejected={stats.rejected}
      />

      <GlassCard isHoverLift={false} className="p-4">
        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filterStatus={filterStatus}
          onStatusChange={setFilterStatus}
          dateFrom={dateFrom}
          onDateFromChange={setDateFrom}
          dateTo={dateTo}
          onDateToChange={setDateTo}
        />
      </GlassCard>

      <HoursLogsTable
        logs={filteredLogs}
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
