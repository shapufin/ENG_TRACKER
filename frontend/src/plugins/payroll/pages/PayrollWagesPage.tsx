/**
 * PayrollWagesPage — manage effective-dated wage assignments.
 */
import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FormDialog } from "@/components/ui/FormDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Trash2 } from "lucide-react";
import { DatePicker } from "@/components/ui/DatePicker";
import { DataTable } from "@/components/ui/DataTable";
import { payrollService } from "../services/payrollService";
import { usePluginPermissions } from "@/hooks/usePluginPermissions";
import { handleApiError } from "@/lib/error-handler";
import { toLocalISODate } from "@/lib/date-format-utils";
import { toast } from "sonner";
import type { EligibleUser, WageAssignment } from "../types";

interface WageForm {
  user: string;
  gross_monthly_wage: string;
  effective_from: string;
  effective_to: string;
  note: string;
}

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

  const columns = useMemo<ColumnDef<EmployeeWageRow>[]>(
    () => [
      {
        accessorKey: "full_name",
        header: "Employee / Team Leader",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.full_name}</div>
            <div className="text-xs text-muted-foreground">@{row.original.username}</div>
          </div>
        ),
      },
      {
        id: "assignment",
        header: "Wage Assignment",
        cell: ({ row }) =>
          row.original.wage ? (
            <div>
              <div className="font-semibold">
                {Number(row.original.wage.gross_monthly_wage).toLocaleString()} Lek
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground">Not assigned</span>
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
              header: "Actions",
              cell: ({ row }) => (
                <div className="flex justify-end gap-1">
                  {row.original.wage ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditForm(row.original.wage!)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(row.original.wage!.id)}
                      >
                        Delete
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" onClick={() => openAddForm(row.original)}>
                      Assign Wage
                    </Button>
                  )}
                </div>
              ),
            } as ColumnDef<EmployeeWageRow>,
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
    >
      <GlassCard className="p-6">
        <DataTable
          columns={columns}
          data={rows}
          searchColumn="full_name"
          searchPlaceholder="Search employees and team leaders..."
          emptyMessage="No active employees or team leaders found."
        />
      </GlassCard>

      {canManagePayroll && (
        <FormDialog
          open={formOpen}
          onOpenChange={(open) => {
            if (!open) closeForm();
          }}
          title={editingId ? "Edit Wage Assignment" : "Assign Wage"}
          description="Set the authoritative base monthly salary for payroll runs."
          onSubmit={(e) => {
            e.preventDefault();
            saveForm();
          }}
          isSubmitting={isSaving}
          submitLabel={editingId ? "Update" : "Assign Wage"}
          submitDisabled={!form.user || !form.gross_monthly_wage || invalidDateRange || invalidWage}
          size="sm"
        >
          <div>
            <Label>Employee</Label>
            <div className="mt-1 flex items-center gap-3 rounded-2xl border border-border bg-muted/30 px-3 py-2 text-sm">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-bold text-primary-foreground"
              >
                {(formUser?.full_name ?? form.user)
                  .split(" ")
                  .map((w) => w[0])
                  .join("")}
              </span>
              <div>
                <div className="text-xs font-bold">{formUser?.full_name ?? form.user}</div>
                {formUser && (
                  <div className="font-mono text-[10px] text-muted-foreground">
                    @{formUser.username}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div>
            <Label htmlFor="wage">Gross Monthly Wage (Lek)</Label>
            <div className="relative mt-1">
              <Input
                id="wage"
                type="number"
                value={form.gross_monthly_wage}
                onChange={(e) => setForm({ ...form, gross_monthly_wage: e.target.value })}
                placeholder="e.g. 100000"
                className="pr-20"
              />
              <span
                aria-hidden="true"
                className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs font-bold text-primary"
              >
                Lek / mo
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="from">Start Date (DD/MM/YYYY, optional)</Label>
              <DatePicker
                id="from"
                value={form.effective_from}
                onChange={(value) => setForm({ ...form, effective_from: value })}
              />
            </div>
            <div>
              <Label htmlFor="to">Effective To (DD/MM/YYYY, optional)</Label>
              <DatePicker
                id="to"
                value={form.effective_to}
                onChange={(value) => setForm({ ...form, effective_to: value })}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="note">Note (optional)</Label>
            <Input
              id="note"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>
        </FormDialog>
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
