import React, { useMemo, useState } from "react";
import { useLeaveBalances } from "@/hooks/useLeaveBalances";
import { Navigate, useSearchParams } from "react-router-dom";
import { DataTable } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageShell } from "@/components/layout/PageShell";
import { PluginImportButton } from "@/components/admin/PluginImportButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { CalendarClock, Plus } from "lucide-react";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import type { LeaveBalance } from "@/types";
import { usePermissions } from "@/context/PermissionContext";
import { useLeaveBalanceForm } from "./hooks/useLeaveBalanceForm";
import { useLeaveBalanceColumns } from "./hooks/useLeaveBalanceColumns";
import {
  CARRYOVER_WINDOW_DAYS,
  computeBalanceTotals,
  filterBalances,
} from "./hooks/leaveBalanceFilters";
import { LeaveBalanceKpis } from "./components/LeaveBalanceKpis";
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

  const [searchParams, setSearchParams] = useSearchParams();
  const expiringOnly = searchParams.get("expiring") === "1";
  const yearParam = Number(searchParams.get("year")) || undefined;
  const typeParam = searchParams.get("type");
  const typeFilter = typeParam === "vacation" || typeParam === "sick" ? typeParam : undefined;
  const writeParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };
  const toggleExpiring = () => writeParam("expiring", expiringOnly ? null : "1");

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

  const { visibleBalances, totals, yearOptions, typeOptions } = useMemo(() => {
    const all = balances || [];
    const today = new Date();
    const visible = filterBalances(all, { year: yearParam, type: typeFilter, expiringOnly }, today);
    const years = [...new Set<number>(all.map((b) => b.year))].sort((x, y) => y - x);
    const types = (["vacation", "sick"] as const).filter((t) =>
      all.some((b) => b.leave_type === t)
    );
    return {
      visibleBalances: visible,
      totals: computeBalanceTotals(visible, today),
      yearOptions: [
        { value: "all", label: "All" },
        ...years.map((y) => ({ value: String(y), label: String(y) })),
      ],
      typeOptions: [
        { value: "all", label: "All" },
        ...types.map((t) => ({ value: t, label: t === "sick" ? "Sick" : "Vacation" })),
      ],
    };
  }, [balances, yearParam, typeFilter, expiringOnly]);

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
      <LeaveBalanceKpis
        totals={totals}
        expiringOnly={expiringOnly}
        onToggleExpiring={toggleExpiring}
      />
      <GlassCard delay={0} className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <FilterChipRow
            label="Year"
            options={yearOptions}
            selected={[yearParam ? String(yearParam) : "all"]}
            onToggle={(v) => writeParam("year", v === "all" ? null : v)}
          />
          <FilterChipRow
            label="Type"
            options={typeOptions}
            selected={[typeFilter ?? "all"]}
            onToggle={(v) => writeParam("type", v === "all" ? null : v)}
          />
          <FilterChipRow
            label="Carry-over"
            options={[
              {
                value: "expiring",
                label: `Expiring ≤ ${CARRYOVER_WINDOW_DAYS} days`,
                icon: CalendarClock,
              },
            ]}
            selected={expiringOnly ? ["expiring"] : []}
            onToggle={toggleExpiring}
          />
        </div>
        <DataTable
          columns={columns}
          data={visibleBalances}
          enableColumnVisibility
          storageKey="table-visibility-leave-balances"
          searchColumn="user_name"
          searchPlaceholder="Search balances..."
        />
        <p aria-live="polite" className="text-muted-foreground mt-2 text-xs">
          {visibleBalances.length} balance{visibleBalances.length === 1 ? "" : "s"}
        </p>
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
