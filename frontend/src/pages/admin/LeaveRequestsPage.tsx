import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { leaveService } from "@/services/leaveService";
import { userService } from "@/services/userService";
import { useAdminRejectMutation } from "@/hooks/useAdminRejectMutation";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/PageShell";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { Sun, Stethoscope, Download } from "lucide-react";
import { invalidateAdminDashboard } from "@/lib/adminDashboardKeys";
import { handleApiError } from "@/lib/error-handler";
import { toast } from "sonner";
import { usePermissions } from "@/context/PermissionContext";
import { LeaveToolbarFilters } from "./components/LeaveFilterBar";
import { StatusChips } from "./components/filterBarParts";
import { StatsCards } from "@/components/admin/StatsCards";
import { StatCard } from "@/components/ui/StatCard";
import { BulkDecisionBar } from "./components/BulkDecisionBar";
import { LeaveRequestsTable } from "./components/LeaveRequestsTable";
import { useBulkOperations } from "@/hooks/useBulkOperations";
import { useScopedRowSelection } from "./hooks/useScopedRowSelection";
import { useLeaveRequestFilters } from "./hooks/useLeaveRequestFilters";
import {
  buildLeaveRequestFilters,
  useLeaveRequestsServerData,
} from "./hooks/useLeaveRequestsServerData";
import { paginatedFetchAll } from "@/lib/download";
import type { LeaveRequest } from "@/types";
import { exportLeaveRequestsToCSV } from "@/lib/export-leave-requests";

const runBulk =
  <A extends unknown[]>(action: (...args: A) => Promise<unknown>) =>
  async (...args: A) => {
    try {
      await action(...args);
      return true;
    } catch (err) {
      handleApiError(err);
      return false;
    }
  };

const LeaveRequestsContent: React.FC = () => {
  const qc = useQueryClient();
  const { isSuperuser, isAdmin } = usePermissions();

  // HR cannot list every account (admins included); they pick from plain employees.
  const { data: users } = useQuery({
    queryKey: ["admin", "users", isAdmin ? "all" : "employees"],
    queryFn: async () =>
      isAdmin
        ? (await userService.getUsers({ page_size: 500 })).results
        : (
            await userService.getProfiles({ role: "assignable_employee", page_size: 500 })
          ).results.map((p) => p.user),
    refetchOnMount: true,
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  const { data: italianTLs } = useQuery({
    queryKey: ["admin", "team-leaders", "italian"],
    queryFn: () => userService.getItalianTeamLeaders(),
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });
  const { data: albanianTLs } = useQuery({
    queryKey: ["admin", "team-leaders", "albanian"],
    queryFn: () => userService.getAlbanianTeamLeaders(),
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  const filters = useLeaveRequestFilters();
  const {
    filterStatus,
    setFilterStatus,
    filterUser,
    setFilterUser,
    filterType,
    setFilterType,
    italianTl,
    setItalianTl,
    albanianTl,
    setAlbanianTl,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    searchQuery,
    setSearchQuery,
    page,
    setPage,
  } = filters;
  const { requests, total, stats, isLoading, onRowRemoved } = useLeaveRequestsServerData({
    fetchPage: leaveService.getAdminRequests,
    ...filters,
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => leaveService.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "leaves", "requests"] });
      qc.invalidateQueries({ queryKey: ["vacations", "calendar"] });
      onRowRemoved();
      toast.success("Approved");
    },
    onError: (err: unknown) => handleApiError(err),
  });

  const rejectMutation = useAdminRejectMutation(leaveService.reject, {
    invalidateKeys: [
      ["admin", "leaves", "requests"],
      ["vacations", "calendar"],
    ],
    onSuccess: () => onRowRemoved(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => leaveService.deleteRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "leaves", "requests"] });
      qc.invalidateQueries({ queryKey: ["vacations", "calendar"] });
      onRowRemoved();
      toast.success("Leave request deleted and balance restored");
    },
    onError: (err: unknown) => handleApiError(err),
  });

  const {
    rowSelection,
    setRowSelection,
    clear: clearSelection,
  } = useScopedRowSelection(
    JSON.stringify([
      page,
      filterStatus,
      filterUser,
      filterType,
      italianTl,
      albanianTl,
      dateFrom,
      dateTo,
      searchQuery,
    ])
  );

  const { bulkApproveMutation, bulkRejectMutation } = useBulkOperations({
    queryKey: ["admin", "leaves", "requests"],
    entityName: "requests",
    approveFn: leaveService.bulkApprove,
    rejectFn: leaveService.bulkReject,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vacations", "calendar"] });
      void invalidateAdminDashboard(qc);
    },
  });
  const bulk = {
    approve: runBulk((ids: number[]) => bulkApproveMutation.mutateAsync(ids)),
    reject: runBulk((ids: number[], reason: string) =>
      bulkRejectMutation.mutateAsync({ ids, reason })
    ),
    isPending: bulkApproveMutation.isPending || bulkRejectMutation.isPending,
  };
  const selectedPendingIds = requests
    .filter((r) => rowSelection[r.id.toString()] && r.status === "pending")
    .map((r) => r.id);
  const selectedCount = Object.keys(rowSelection).filter((id) => rowSelection[id]).length;

  const handleExport = async () => {
    try {
      const filters = buildLeaveRequestFilters({
        filterStatus,
        filterUser,
        filterType,
        italianTl,
        albanianTl,
        dateFrom,
        dateTo,
        searchQuery,
      });
      const all = await paginatedFetchAll<LeaveRequest>(
        async (p) => ({ data: await leaveService.getAdminRequests({ ...filters, ...p }) }),
        500
      );
      exportLeaveRequestsToCSV(all);
    } catch (err) {
      handleApiError(err);
    }
  };

  if (isLoading) {
    return <LoadingCard rows={5} className="min-h-[300px]" />;
  }

  return (
    <PageShell
      title="Leave Requests"
      subtitle="Manage and review employee leave submissions."
      actions={
        <Button variant="outline" size="sm" onClick={() => void handleExport()} className="gap-2">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      }
    >
      <StatsCards
        total={stats.total}
        pending={stats.pending}
        approved={stats.approved}
        rejected={stats.rejected}
        additionalCards={
          <>
            <StatCard label="Vacation" value={stats.vacation} icon={Sun} glow="primary" />
            <StatCard
              label="Sick Leave"
              value={stats.sick}
              icon={Stethoscope}
              glow="warning"
              iconColorClass="text-warning"
            />
          </>
        }
      />

      <LeaveRequestsTable
        header={
          <StatusChips
            filterStatus={filterStatus}
            onStatusChange={setFilterStatus}
            counts={stats}
          />
        }
        toolbar={
          <LeaveToolbarFilters
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filterType={filterType}
            onTypeChange={setFilterType}
            filterUser={filterUser}
            onUserChange={setFilterUser}
            users={users}
            tlFilters={{
              italianTLs: italianTLs ?? [],
              italianTl,
              onItalianTlChange: setItalianTl,
              albanianTLs: albanianTLs ?? [],
              albanianTl,
              onAlbanianTlChange: setAlbanianTl,
            }}
            dateFrom={dateFrom}
            onDateFromChange={setDateFrom}
            dateTo={dateTo}
            onDateToChange={setDateTo}
          />
        }
        requests={requests}
        server={{
          search: searchQuery,
          onSearchChange: setSearchQuery,
          page,
          total,
          onPageChange: setPage,
        }}
        onApprove={(id) => approveMutation.mutate(id)}
        onReject={(id, reason) => rejectMutation.mutate({ id, reason })}
        onDelete={(id) => deleteMutation.mutate(id)}
        canDelete={isSuperuser}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
      />
      <BulkDecisionBar
        selectedCount={selectedCount}
        pendingIds={selectedPendingIds}
        bulk={bulk}
        entityName="requests"
        onClear={clearSelection}
      />
    </PageShell>
  );
};

export const LeaveRequestsPage: React.FC = () => {
  const { isAdmin, isHR } = usePermissions();
  if (!isAdmin && !isHR) {
    return <Navigate to="/leave-management" replace />;
  }
  return <LeaveRequestsContent />;
};

export default LeaveRequestsPage;
