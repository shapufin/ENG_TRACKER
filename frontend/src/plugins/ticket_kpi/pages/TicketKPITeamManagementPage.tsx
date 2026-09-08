import React from "react";
import { usePermissions } from "@/context/PermissionContext";
import { PageShell } from "@/components/layout/PageShell";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";
import { useTicketKPITeamManagement } from "./hooks/useTicketKPITeamManagement";
import { TicketKPITeamControls } from "../components/TicketKPITeamControls";
import { TicketKPITeamStats } from "../components/TicketKPITeamStats";
import { TicketKPITeamBatchesTable } from "../components/TicketKPITeamBatchesTable";
import { formatMonthLabel } from "@/lib/monthOptions";

export const TicketKPITeamManagementPage: React.FC = () => {
  const { isTeamLeader, isAdmin, isHR } = usePermissions();
  const {
    selectedMonth,
    setSelectedMonth,
    batchToDelete,
    setBatchToDelete,
    rows,
    stats,
    isLoading,
    deleteMutation,
  } = useTicketKPITeamManagement(isTeamLeader);

  if (!isTeamLeader) {
    return (
      <PageShell title="KPI Team Management">
        <EmptyState
          icon={ShieldAlert}
          title="You do not have team leader permissions."
          description="This module is reserved for assigned Team Leaders. Aggregate metrics are available in HR Reports."
          action={
            isAdmin || isHR ? (
              <Button variant="outline" size="sm" asChild>
                <a href="/hr/reports">Go to HR Reports</a>
              </Button>
            ) : undefined
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="KPI Team Management"
      subtitle="Review and manage your team members' ticket uploads."
    >
      <div className="space-y-6">
        <TicketKPITeamControls selectedMonth={selectedMonth} onMonthChange={setSelectedMonth} />
        <TicketKPITeamStats
          totalRecords={stats.totalRecords}
          uniqueUsers={stats.uniqueUsers}
          uniqueMonths={stats.uniqueMonths}
        />
        <TicketKPITeamBatchesTable rows={rows} isLoading={isLoading} onDelete={setBatchToDelete} />
      </div>

      <ConfirmDialog
        open={!!batchToDelete}
        onOpenChange={(open) => !open && setBatchToDelete(null)}
        title="Delete Upload"
        description={
          batchToDelete
            ? `Remove the upload for ${batchToDelete.username || `User ${batchToDelete.user}`} for ${formatMonthLabel(batchToDelete.month)}? This will delete ${batchToDelete.record_count} records and allow the user to re-upload.`
            : ""
        }
        onConfirm={() => batchToDelete && deleteMutation.mutate(batchToDelete.id)}
        isConfirming={deleteMutation.isPending}
        confirmLabel="Delete"
        variant="destructive"
      />
    </PageShell>
  );
};
