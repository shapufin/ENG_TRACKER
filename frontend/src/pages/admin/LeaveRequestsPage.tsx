import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { leaveService } from "@/services/leaveService";
import { userService } from "@/services/userService";
import { useAdminRejectMutation } from "@/hooks/useAdminRejectMutation";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { Sun, Stethoscope, Download } from "lucide-react";
import { handleApiError } from "@/lib/error-handler";
import { toast } from "sonner";
import { usePermissions } from "@/context/PermissionContext";
import { LeaveFilterBar } from "./components/LeaveFilterBar";
import { StatsCards } from "@/components/admin/StatsCards";
import { StatCard } from "@/components/ui/StatCard";
import { LeaveRequestsTable } from "./components/LeaveRequestsTable";
import { useLeaveRequestFilters } from "./hooks/useLeaveRequestFilters";
import { useLeaveRequestStats } from "./hooks/useLeaveRequestStats";
import { exportLeaveRequestsToCSV } from "@/lib/export-leave-requests";

const LeaveRequestsContent: React.FC = () => {
  const qc = useQueryClient();
  const { isSuperuser } = usePermissions();

  const { data: requests, isLoading } = useQuery({
    queryKey: ["admin", "leaves", "requests"],
    queryFn: () => leaveService.getRequests({ page_size: 500, ignore_date_filter: "true" }),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const { data: users } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => userService.getUsers({ page_size: 500 }),
    refetchOnMount: true,
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => leaveService.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "leaves", "requests"] });
      qc.invalidateQueries({ queryKey: ["vacations", "calendar"] });
      toast.success("Approved");
    },
    onError: (err: unknown) => handleApiError(err),
  });

  const rejectMutation = useAdminRejectMutation(leaveService.reject, {
    invalidateKeys: [
      ["admin", "leaves", "requests"],
      ["vacations", "calendar"],
    ],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => leaveService.deleteRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "leaves", "requests"] });
      qc.invalidateQueries({ queryKey: ["vacations", "calendar"] });
      toast.success("Leave request deleted and balance restored");
    },
    onError: (err: unknown) => handleApiError(err),
  });

  const {
    filterStatus,
    setFilterStatus,
    filterUser,
    setFilterUser,
    filterType,
    setFilterType,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    searchQuery,
    setSearchQuery,
    filteredRequests,
  } = useLeaveRequestFilters(requests);

  const stats = useLeaveRequestStats(requests);

  const handleExport = () => exportLeaveRequestsToCSV(filteredRequests);

  if (isLoading) {
    return (
      <PageShell title="Leave Requests" subtitle="Manage vacation and sick leave">
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Leave Requests"
      subtitle="Manage and review employee leave submissions."
      category="Workforce Management"
      actions={
        <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
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

      <GlassCard isHoverLift={false} className="p-4">
        <LeaveFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filterStatus={filterStatus}
          onStatusChange={setFilterStatus}
          filterType={filterType}
          onTypeChange={setFilterType}
          filterUser={filterUser}
          onUserChange={setFilterUser}
          users={users?.results}
          dateFrom={dateFrom}
          onDateFromChange={setDateFrom}
          dateTo={dateTo}
          onDateToChange={setDateTo}
        />
      </GlassCard>

      <LeaveRequestsTable
        requests={filteredRequests}
        onApprove={(id) => approveMutation.mutate(id)}
        onReject={(id, reason) => rejectMutation.mutate({ id, reason })}
        onDelete={(id) => deleteMutation.mutate(id)}
        canDelete={isSuperuser}
      />
    </PageShell>
  );
};

export const LeaveRequestsPage: React.FC = () => {
  const { isAdmin } = usePermissions();
  if (!isAdmin) {
    return <Navigate to="/leave-management" replace />;
  }
  return <LeaveRequestsContent />;
};

export default LeaveRequestsPage;
