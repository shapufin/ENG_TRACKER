import React, { useState } from "react";
import { useLeaveQueries } from "@/hooks/useLeaveQueries";
import { useAuth } from "@/context/AuthContext";
import { Plus, FileDown, Download, X } from "lucide-react";
import type { LeaveRequest } from "@/types";
import { usePermissions } from "@/context/PermissionContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/DataTable";
import { GlassCard } from "@/components/ui/GlassCard";
import { FormDialog } from "@/components/ui/FormDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageShell } from "@/components/layout/PageShell";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { exportData } from "@/utils/exportUtils";
import { useLeaveForm } from "./hooks/useLeaveForm";
import { getRemainingDays } from "./hooks/leaveBalanceUtils";
import { useLeaveColumns } from "./hooks/useLeaveColumns";
import { LeaveStatsCards } from "./components/LeaveStatsCards";
import { LeaveRequestForm } from "./components/LeaveRequestForm";

// fallow-ignore-next-line complexity
export const LeavePage: React.FC = () => {
  const { user } = useAuth();
  const { isAdmin, isHR, isTeamLeader } = usePermissions();
  const canApprove = isAdmin || isHR || isTeamLeader;
  const canDelete = (request: LeaveRequest) => isAdmin || request.user === user?.id;
  const userId = user?.id ?? "anonymous";

  const {
    formData,
    setFormData,
    formErrors,
    setFormErrors,
    editing,
    formOpen,
    setFormOpen,
    resetForm,
    openCreate,
    openEdit,
    validateForm,
  } = useLeaveForm();

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const {
    requests,
    balances,
    requestsLoading,
    balancesLoading,
    createMutation,
    updateMutation,
    deleteMutation,
    approveMutation,
    rejectMutation,
  } = useLeaveQueries({
    userId,
    onCreateSuccess: () => {
      setFormOpen(false);
      resetForm();
    },
    onUpdateSuccess: () => {
      setFormOpen(false);
      setFormOpen(false);
      resetForm();
    },
    onApproveSuccess: () => {
      setRejectOpen(false);
      setRejectingId(null);
      setRejectReason("");
    },
    onRejectSuccess: () => {
      setRejectOpen(false);
      setRejectingId(null);
      setRejectReason("");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    if (editing) {
      updateMutation.mutate({
        id: editing.id,
        data: formData as unknown as Record<string, unknown>,
      });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleRejectClick = (id: number) => {
    setRejectingId(id);
    setRejectOpen(true);
  };

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const approvedCount = requests.filter((r) => r.status === "approved").length;
  const rejectingRequest = requests.find((r) => r.id === rejectingId) ?? null;
  // DRF serializes DecimalFields as strings — the helper normalizes at the
  // boundary so the banner always receives a real number.
  const remainingDays = getRemainingDays(balances);

  const columns = useLeaveColumns(
    canApprove,
    openEdit,
    (id) => deleteMutation.mutate(id),
    canDelete,
    (id) => approveMutation.mutate(id),
    handleRejectClick
  );

  const handleExportCSV = () => {
    exportData(requests ?? [], "vacations", "csv", {
      headers: ["ID", "User", "Type", "Start", "End", "Days", "Status", "Reason"],
      rowMapper: (r: LeaveRequest) => [
        String(r.id),
        r.user_name || String(r.user),
        r.request_type,
        r.start_date,
        r.end_date,
        String(r.days_requested),
        r.status,
        r.reason || "",
      ],
    });
  };

  return (
    <PageShell
      title="Leave Management"
      subtitle="Manage vacation leave requests and balances."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportCSV}>
            <FileDown className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => exportData(requests ?? [], "vacations", "json")}
          >
            <Download className="h-3.5 w-3.5" /> JSON
          </Button>
          <Button size="sm" className="gap-1.5" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" /> New Request
          </Button>
        </div>
      }
    >
      {requestsLoading || balancesLoading ? (
        <LoadingCard rows={4} className="min-h-[300px]" />
      ) : (
        <>
          <LeaveStatsCards
            pendingCount={pendingCount}
            approvedCount={approvedCount}
            balances={balances}
            isLoading={requestsLoading || balancesLoading}
            isTeamLeader={canApprove}
          />
          <GlassCard delay={0} className="p-4">
            <DataTable
              data={requests}
              enableColumnVisibility
              storageKey="table-visibility-vacations-page"
              columns={columns}
            />
          </GlassCard>
        </>
      )}

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? "Edit Request" : "New Request"}
        description="Submit a leave request for review."
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      >
        <LeaveRequestForm
          formData={formData}
          formErrors={formErrors}
          remainingDays={remainingDays}
          onChange={(data) => {
            setFormData(data);
            setFormErrors((prev) => ({
              ...prev,
              request_type: undefined,
              start_date: undefined,
              end_date: undefined,
            }));
          }}
        />
      </FormDialog>

      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="Reject Request"
        description="Provide a reason for rejection:"
        icon={<X className="h-4 w-4" />}
        contextSlot={
          rejectingRequest && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-foreground">
              Rejecting <strong>{rejectingRequest.request_type}</strong> leave for{" "}
              <strong>{rejectingRequest.user_name ?? "employee"}</strong> (
              {rejectingRequest.start_date} → {rejectingRequest.end_date}).
            </div>
          )
        }
        onConfirm={() =>
          rejectingId && rejectMutation.mutate({ id: rejectingId, reason: rejectReason })
        }
        isConfirming={rejectMutation.isPending}
        confirmLabel="Reject"
        variant="destructive"
      >
        <div className="pt-2">
          <Input
            placeholder="Rejection reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
        </div>
      </ConfirmDialog>
    </PageShell>
  );
};
