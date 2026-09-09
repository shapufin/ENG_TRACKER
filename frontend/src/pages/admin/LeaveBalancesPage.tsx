import React, { useState } from "react";
import { useLeaveBalances } from "@/hooks/useLeaveBalances";
import { Navigate } from "react-router-dom";
import { DataTable } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageShell } from "@/components/layout/PageShell";
import { PluginImportButton } from "@/components/admin/PluginImportButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Plus } from "lucide-react";
import type { LeaveBalance } from "@/types";
import { usePermissions } from "@/context/PermissionContext";
import { useLeaveBalanceForm } from "./hooks/useLeaveBalanceForm";
import { useLeaveBalanceColumns } from "./hooks/useLeaveBalanceColumns";
import { LeaveBalanceFormDialog } from "./components/LeaveBalanceFormDialog";
import { LeaveBalanceAuditDialog } from "./components/LeaveBalanceAuditDialog";

const LeaveBalancesContent: React.FC = () => {
  const {
    formOpen,
    setFormOpen,
    editing,
    form,
    formErrors,
    openCreate,
    openEdit,
    buildPayload,
    setFormErrors,
    setForm,
    setEditing,
  } = useLeaveBalanceForm();

  const [confirmDelete, setConfirmDelete] = useState<LeaveBalance | null>(null);
  const [auditBalance, setAuditBalance] = useState<LeaveBalance | null>(null);

  const { balances, users, isLoading, isError, createMutation, updateMutation, deleteMutation } =
    useLeaveBalances({
      onCreateSuccess: () => {
        setFormOpen(false);
        setEditing(null);
        setForm({
          user: "",
          leave_type: "",
          year: String(new Date().getFullYear()),
          total_days: "",
          used_days: "",
          is_carry_over: false,
          expires_at: "",
          accrual_start_date: "",
        });
        setFormErrors({});
      },
      onUpdateSuccess: () => {
        setFormOpen(false);
        setEditing(null);
        setFormErrors({});
      },
      onDeleteSuccess: () => setConfirmDelete(null),
    });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = buildPayload();
    if (editing) updateMutation.mutate({ id: editing.id, payload });
    else createMutation.mutate(payload);
  };

  const columns = useLeaveBalanceColumns(openEdit, setConfirmDelete, setAuditBalance);

  if (isLoading) return <LoadingCard rows={4} className="min-h-[300px]" />;
  if (isError)
    return <ErrorCard title="Failed to load balances" onRetry={() => window.location.reload()} />;

  return (
    <PageShell
      title="Leave Balances"
      actions={
        <div className="flex flex-wrap gap-2">
          <PluginImportButton targetKey="leave_balances" invalidateKeys={[["admin", "balances"]]} />
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Add Balance
          </Button>
        </div>
      }
    >
      <GlassCard delay={0} className="p-4">
        <DataTable
          columns={columns}
          data={balances || []}
          enableColumnVisibility
          storageKey="table-visibility-leave-balances"
          searchColumn="user_name"
          searchPlaceholder="Search balances..."
        />
      </GlassCard>
      <LeaveBalanceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editingName={editing?.user_name}
        form={form}
        formErrors={formErrors}
        users={users}
        isSubmitting={updateMutation.isPending || createMutation.isPending}
        onSubmit={handleSubmit}
        onFormChange={setForm}
        onFormErrorsChange={setFormErrors}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={() => setConfirmDelete(null)}
        title="Delete Balance"
        description={`Delete balance for ${confirmDelete?.user_name}?`}
        onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
      />
      <LeaveBalanceAuditDialog balance={auditBalance} onClose={() => setAuditBalance(null)} />
    </PageShell>
  );
};

export const LeaveBalancesPage: React.FC = () => {
  const { isAdmin } = usePermissions();
  if (!isAdmin) return <Navigate to="/leave-management" replace />;
  return <LeaveBalancesContent />;
};
