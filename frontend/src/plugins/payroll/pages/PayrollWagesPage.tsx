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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
        <Dialog
          open={formOpen}
          onOpenChange={(open) => {
            if (!open) closeForm();
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Wage Assignment" : "Assign Wage"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Employee</Label>
                <div className="mt-1 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  {formUser?.full_name ?? form.user}
                  {formUser && (
                    <span className="ml-2 text-muted-foreground">@{formUser.username}</span>
                  )}
                </div>
              </div>
              <div>
                <Label htmlFor="wage">Gross Monthly Wage (Lek)</Label>
                <Input
                  id="wage"
                  type="number"
                  value={form.gross_monthly_wage}
                  onChange={(e) => setForm({ ...form, gross_monthly_wage: e.target.value })}
                  placeholder="e.g. 100000"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeForm}>
                Cancel
              </Button>
              <Button
                onClick={saveForm}
                disabled={
                  isSaving ||
                  !form.user ||
                  !form.gross_monthly_wage ||
                  invalidDateRange ||
                  invalidWage
                }
              >
                {isSaving ? "Saving..." : editingId ? "Update" : "Assign Wage"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {canManagePayroll && (
        <Dialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Wage Assignment</DialogTitle>
            </DialogHeader>
            <p className="py-4 text-sm text-muted-foreground">
              Are you sure you want to delete this wage assignment? This action cannot be undone.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteId && deleteMutation.mutate(deleteId)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </PageShell>
  );
};
