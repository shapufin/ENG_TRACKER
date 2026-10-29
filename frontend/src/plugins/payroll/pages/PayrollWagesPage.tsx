/**
 * PayrollWagesPage — manage effective-dated wage assignments.
 */
import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AppColumnDef } from "@/components/ui/tableTypes";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { RowActions } from "@/components/ui/RowActions";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { AlertCircle, CheckCircle2, Download, Pencil, Trash2, Users2 } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { PluginImportButton } from "@/components/admin/PluginImportButton";
import { UserCell } from "@/components/admin/UserCell";
import { StatCard } from "@/components/ui/StatCard";
import { FilterChipRow, type FilterChipOption } from "@/components/ui/FilterChipRow";
import { payrollService } from "../services/payrollService";
import { usePluginPermissions } from "@/hooks/usePluginPermissions";
import { handleApiError } from "@/lib/error-handler";
import { toLocalISODate } from "@/lib/date-format-utils";
import { exportData } from "@/utils/exportUtils";
import { toast } from "sonner";
import { AssignWageDialog, type AssignWageForm } from "../components/AssignWageDialog";
import type { EligibleUser, WageAssignment } from "../types";

type WageForm = AssignWageForm;
type WageFilter = "all" | "assigned" | "unassigned";

interface EmployeeWageRow extends EligibleUser {
  wage: WageAssignment | null;
}

const EMPTY_FORM: WageForm = {
  user: "",
  gross_monthly_wage: "",
  effective_from: "",
  effective_to: "",
  note: "",
};

const todayISO = () => toLocalISODate(new Date());

export const PayrollWagesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { canManage } = usePluginPermissions();
  const canManagePayroll = canManage("payroll");
  const [filter, setFilter] = useState<WageFilter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<WageForm>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const wagesQuery = useQuery({
    queryKey: ["payroll-wages"],
    queryFn: () => payrollService.getWages(),
  });
  const eligibleUsersQuery = useQuery({
    queryKey: ["payroll-eligible-users"],
    queryFn: () => payrollService.getEligibleUsers(),
  });

  const eligibleUsers = eligibleUsersQuery.data ?? [];
  const rows = useMemo<EmployeeWageRow[]>(
    () =>
      (eligibleUsersQuery.data ?? []).map((user) => ({
        ...user,
        wage:
          (wagesQuery.data ?? []).find((wage) => wage.user === user.id && wage.is_active) ?? null,
      })),
    [eligibleUsersQuery.data, wagesQuery.data]
  );

  const totalCount = rows.length;
  const assignedRows = useMemo(() => rows.filter((row) => row.wage !== null), [rows]);
  const missingWageRows = useMemo(() => rows.filter((row) => !row.wage), [rows]);
  const assignedCount = assignedRows.length;
  const missingCount = missingWageRows.length;

  const filteredRows = useMemo(() => {
    if (filter === "assigned") return assignedRows;
    if (filter === "unassigned") return missingWageRows;
    return rows;
  }, [rows, filter, assignedRows, missingWageRows]);

  const filterOptions = useMemo<FilterChipOption<WageFilter>[]>(
    () => [
      { value: "all", label: "All employees", count: totalCount, icon: Users2 },
      { value: "assigned", label: "Assigned", count: assignedCount, icon: CheckCircle2 },
      {
        value: "unassigned",
        label: "Missing wage",
        count: missingCount,
        icon: AlertCircle,
        emphasis: "missing",
      },
    ],
    [totalCount, assignedCount, missingCount]
  );

  const downloadMissingWagesCsv = () => {
    exportData(missingWageRows, "wages_missing", "csv", {
      headers: [
        "username",
        "full_name",
        "gross_monthly_wage",
        "effective_from",
        "effective_to",
        "note",
      ],
      rowMapper: (row) => [row.username, row.full_name, "", todayISO(), "", ""],
    });
  };

  const invalidDateRange = Boolean(
    form.effective_to && form.effective_from && form.effective_to < form.effective_from
  );
  const invalidWage = form.gross_monthly_wage !== "" && Number(form.gross_monthly_wage) < 0;

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const invalidateWages = () => {
    queryClient.invalidateQueries({ queryKey: ["payroll-wages"] });
    queryClient.invalidateQueries({ queryKey: ["payroll-eligible-users"] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      payrollService.createWage({
        user: Number(form.user),
        gross_monthly_wage: form.gross_monthly_wage,
        effective_from: form.effective_from || todayISO(),
        effective_to: form.effective_to || null,
        note: form.note,
        is_active: true,
      }),
    onSuccess: () => {
      invalidateWages();
      closeForm();
      toast.success("Wage assignment created");
    },
    onError: (error) => handleApiError(error),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      payrollService.updateWage(editingId!, {
        gross_monthly_wage: form.gross_monthly_wage,
        ...(form.effective_from ? { effective_from: form.effective_from } : {}),
        effective_to: form.effective_to || undefined,
        note: form.note,
        is_active: true,
      }),
    onSuccess: () => {
      invalidateWages();
      closeForm();
      toast.success("Wage assignment updated");
    },
    onError: (error) => handleApiError(error),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => payrollService.deleteWage(id),
    onSuccess: () => {
      invalidateWages();
      setDeleteId(null);
      toast.success("Wage assignment deleted");
    },
    onError: (error) => handleApiError(error),
  });

  const openAddForm = (user: EligibleUser) => {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      user: String(user.id),
      effective_from: todayISO(),
    });
    setFormOpen(true);
  };

  const openEditForm = (wage: WageAssignment) => {
    setEditingId(wage.id);
    setForm({
      user: String(wage.user),
      gross_monthly_wage: wage.gross_monthly_wage,
      effective_from: wage.effective_from,
      effective_to: wage.effective_to ?? "",
      note: wage.note ?? "",
    });
    setFormOpen(true);
  };

  const saveForm = () => {
    if (editingId) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const formUser = eligibleUsers.find((user) => String(user.id) === form.user);

  const columns = useMemo<AppColumnDef<EmployeeWageRow>[]>(
    () => [
      {
        accessorKey: "full_name",
        header: "Employee / Team Leader",
        cell: ({ row }) => (
          <UserCell name={row.original.full_name} subtitle={`@${row.original.username}`} />
        ),
      },
      {
        id: "assignment",
        header: "Wage Assignment",
        cell: ({ row }) =>
          row.original.wage ? (
            <div className="space-y-0.5">
              <div className="text-foreground font-mono font-semibold tabular-nums">
                {Number(row.original.wage.gross_monthly_wage).toLocaleString()} Lek
              </div>
              <div className="text-muted-foreground text-xs">
                Effective {row.original.wage.effective_from}
                {row.original.wage.effective_to ? ` → ${row.original.wage.effective_to}` : ""}
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground text-xs italic">Not assigned</span>
          ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <StatusBadge
            variant={row.original.wage ? "approved" : "pending"}
            label={row.original.wage ? "Assigned" : "Missing wage"}
            isCompact
            isShowIcon={false}
          />
        ),
      },
      ...(canManagePayroll
        ? [
            {
              id: "actions",
              meta: { actionsDisplay: "column" },
              header: "Actions",
              cell: ({ row }) => (
                <div className="flex justify-end gap-1">
                  {row.original.wage ? (
                    <RowActions
                      reveal="always"
                      actions={[
                        {
                          label: `Edit wage for ${row.original.full_name}`,
                          icon: Pencil,
                          onClick: () => openEditForm(row.original.wage!),
                        },
                        {
                          label: `Delete wage for ${row.original.full_name}`,
                          icon: Trash2,
                          tone: "danger",
                          onClick: () => setDeleteId(row.original.wage!.id),
                        },
                      ]}
                    />
                  ) : (
                    <Button
                      variant="outline"
                      size="control-sm"
                      onClick={() => openAddForm(row.original)}
                    >
                      Assign Wage
                    </Button>
                  )}
                </div>
              ),
            } as AppColumnDef<EmployeeWageRow>,
          ]
        : []),
    ],
    [canManagePayroll]
  );

  const isLoading = wagesQuery.isLoading || eligibleUsersQuery.isLoading;
  const error = wagesQuery.error || eligibleUsersQuery.error;
  const refetch = () => {
    wagesQuery.refetch();
    eligibleUsersQuery.refetch();
  };

  if (isLoading) return <LoadingCard rows={4} className="min-h-[300px]" />;
  if (error) return <ErrorCard title="Failed to load employees and wages" onRetry={refetch} />;

  return (
    <PageShell
      title="Wage Assignments"
      subtitle="Review every employee and team leader, then assign wages directly from the table"
      actions={
        <>
          {canManagePayroll && (
            <Button
              variant="outline"
              size="sm"
              onClick={downloadMissingWagesCsv}
              disabled={missingWageRows.length === 0}
            >
              <Download className="mr-1 h-4 w-4" />
              Download CSV
            </Button>
          )}
          <PluginImportButton
            targetKey="wages"
            invalidateKeys={[["payroll-wages"], ["payroll-eligible-users"]]}
          />
        </>
      }
    >
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Employees"
          value={totalCount}
          icon={Users2}
          iconTone="accent"
          onClick={() => setFilter("all")}
        />
        <StatCard
          label="Wages Assigned"
          value={assignedCount}
          icon={CheckCircle2}
          iconTone="success"
          onClick={() => setFilter("assigned")}
        />
        <StatCard
          label="Missing Wages"
          value={missingCount}
          icon={AlertCircle}
          iconTone={missingCount > 0 ? "warning" : "neutral"}
          onClick={() => setFilter("unassigned")}
        />
      </div>

      <GlassCard className="space-y-4 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <FilterChipRow
            label="Filter"
            options={filterOptions}
            selected={[filter]}
            onToggle={(val) => setFilter(val)}
          />
        </div>
        <DataTable
          columns={columns}
          data={filteredRows}
          searchColumn="full_name"
          searchPlaceholder="Search employees and team leaders..."
          emptyMessage={
            filter === "unassigned"
              ? "All employees have an active wage assignment."
              : filter === "assigned"
                ? "No employees have an assigned wage yet."
                : "No active employees or team leaders found."
          }
        />
      </GlassCard>

      {canManagePayroll && (
        <AssignWageDialog
          open={formOpen}
          onOpenChange={(open) => {
            if (!open) closeForm();
          }}
          mode={editingId ? "edit" : "create"}
          form={form}
          onFormChange={setForm}
          formUser={formUser}
          onSubmit={(e) => {
            e.preventDefault();
            saveForm();
          }}
          isSubmitting={isSaving}
          submitDisabled={!form.user || !form.gross_monthly_wage || invalidDateRange || invalidWage}
        />
      )}

      {canManagePayroll && (
        <ConfirmDialog
          open={deleteId !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteId(null);
          }}
          title="Delete Wage Assignment"
          description="Are you sure you want to delete this wage assignment? This action cannot be undone."
          confirmLabel="Delete"
          variant="destructive"
          icon={<Trash2 className="h-4 w-4" />}
          isConfirming={deleteMutation.isPending}
          onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        />
      )}
    </PageShell>
  );
};
