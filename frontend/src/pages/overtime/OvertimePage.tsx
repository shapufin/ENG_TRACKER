import React from "react";
import { useOvertimeQueries } from "@/hooks/useOvertimeQueries";
import { overtimeService } from "@/services/overtimeService";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/PageShell";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Plus } from "lucide-react";
import type { OvertimeLog } from "@/types";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import { useBulkOperations } from "@/hooks/useBulkOperations";
import { useOvertimeForm } from "./hooks/useOvertimeForm";
import { useOvertimeColumns } from "./hooks/useOvertimeColumns";
import { OvertimeFormDialog } from "./components/OvertimeFormDialog";
import { OvertimeSummaryCards } from "./components/OvertimeSummaryCards";
import { useHoursLogPageSetup } from "@/pages/hours_logs/components/useHoursLogPageSetup";
import { useHoursLogPageContext } from "@/pages/hours_logs/components/useHoursLogPageContext";
import { useHoursLogSubmit } from "@/pages/hours_logs/components/useHoursLogSubmit";
import { HoursLogExportButtons } from "@/pages/hours_logs/components/HoursLogExportButtons";
import { HoursLogDataTable } from "@/pages/hours_logs/components/HoursLogDataTable";
import { DateRangeHistoryButton } from "@/pages/hours_logs/components/DateRangeHistoryButton";
import { HoursLogBulkActionBar } from "@/pages/hours_logs/components/HoursLogDialogs";
import { HoursLogConfirmDialogs } from "@/pages/hours_logs/components/HoursLogConfirmDialogs";

// fallow-ignore-next-line complexity
export const OvertimePage: React.FC = () => {
  const { userId, canApprove, isAdmin, isSuperuser, canViewTeamData, queryClient } =
    useHoursLogPageContext();

  const {
    formOpen,
    setFormOpen,
    editing,
    form,
    formErrors,
    resetForm,
    openCreate,
    openEdit,
    validateForm,
    previewHours,
    buildPayload,
    setForm,
    setFormErrors,
  } = useOvertimeForm();

  const {
    deleteOpen,
    setDeleteOpen,
    deletingId,
    rejectOpen,
    setRejectOpen,
    rejectingId,
    rejectReason,
    setRejectReason,
    rowSelection,
    setRowSelection,
    bulkDeleteOpen,
    setBulkDeleteOpen,
    customDateRange,
    setCustomDateRange,
    openDelete,
    handleRejectClick,
    queryCallbacks,
  } = useHoursLogPageSetup({ setFormOpen, resetForm });

  const {
    logs,
    summary,
    clients,
    users,
    isLoading,
    createMutation,
    updateMutation,
    deleteMutation,
    approveMutation,
    rejectMutation,
    logsQueryKey,
    summaryQueryKey,
    dateParams,
  } = useOvertimeQueries({
    userId,
    customDateRange,
    isAdmin,
    ...queryCallbacks,
  });

  const { bulkDeleteMutation } = useBulkOperations({
    queryKey: logsQueryKey,
    onSuccess: async () => {
      setRowSelection({});
      setBulkDeleteOpen(false);
      await queryClient.refetchQueries({ queryKey: summaryQueryKey });
    },
    deleteFn: overtimeService.bulkDelete,
  });

  const handleSubmit = useHoursLogSubmit<OvertimeLog>({
    validateForm,
    buildPayload,
    editing,
    form,
    isAdmin,
    updateMutation,
    createMutation,
  });

  const columns = useOvertimeColumns(
    canViewTeamData,
    canApprove,
    (id) => approveMutation.mutate(id),
    handleRejectClick,
    openEdit,
    openDelete,
    isAdmin,
    isSuperuser
  );

  if (isLoading) return <LoadingCard rows={4} className="min-h-[300px]" />;
  if (!logs)
    return (
      <ErrorCard
        title="Failed to load overtime logs"
        onRetry={() => queryClient.invalidateQueries({ queryKey: ["overtime"] })}
      />
    );

  return (
    <PageShell
      title="Overtime"
      subtitle={
        customDateRange
          ? `Showing ${customDateRange.from} to ${customDateRange.to}`
          : "Showing current month"
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <DateRangeHistoryButton customDateRange={customDateRange} onApply={setCustomDateRange} />
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Add Entry
          </Button>
        </div>
      }
    >
      <OvertimeSummaryCards summary={summary} isTeamLeader={canApprove} />
      <HoursLogExportButtons
        logs={logs}
        filename="overtime-logs"
        csvHeaders={[
          "User",
          "Date",
          "Client",
          "Hours",
          "Status",
          "Evidence Type",
          "Evidence",
          "Description",
        ]}
        // fallow-ignore-next-line complexity
        rowMapper={(l) => [
          l.user_name || "",
          formatDateDDMMYYYY(l.date),
          l.client_name || "",
          String(Number(l.hours)),
          l.status,
          l.evidence_type || "",
          l.evidence || "",
          l.description || "",
        ]}
        onFetchAll={async () => {
          const all = await overtimeService.downloadAllLogs(dateParams);
          return userId ? all.filter((l) => l.user === userId) : all;
        }}
        onExportCsv={async () => {
          const exportParams = userId ? { ...dateParams, user: String(userId) } : dateParams;
          await overtimeService.exportCsv(exportParams);
        }}
      />

      <HoursLogBulkActionBar
        selectedCount={Object.keys(rowSelection).length}
        onClear={() => setRowSelection({})}
        onDelete={() => setBulkDeleteOpen(true)}
        isPending={bulkDeleteMutation.isPending}
      />

      <HoursLogDataTable
        columns={columns}
        data={logs}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        storageKey="table-visibility-overtime-page"
        {...(canApprove && {
          searchColumn: "client_name",
          searchPlaceholder: "Search by client...",
        })}
      />

      <OvertimeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={!!editing}
        editingLog={editing}
        isAdmin={isAdmin}
        form={form}
        formErrors={formErrors}
        users={users?.results}
        clients={clients}
        previewHours={previewHours}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
        onSubmit={handleSubmit}
        onFormChange={setForm}
        onFormErrorsChange={setFormErrors}
      />

      <HoursLogConfirmDialogs
        deleteOpen={deleteOpen}
        setDeleteOpen={setDeleteOpen}
        deleteTitle="Delete Entry"
        deleteDescription="Are you sure you want to delete this overtime entry?"
        onDelete={() => deletingId && deleteMutation.mutate(deletingId)}
        deleteIsConfirming={deleteMutation.isPending}
        bulkDeleteOpen={bulkDeleteOpen}
        setBulkDeleteOpen={setBulkDeleteOpen}
        selectedCount={Object.keys(rowSelection).length}
        onBulkDelete={() => bulkDeleteMutation.mutate(Object.keys(rowSelection).map(Number))}
        bulkDeleteIsConfirming={bulkDeleteMutation.isPending}
        rejectOpen={rejectOpen}
        setRejectOpen={setRejectOpen}
        rejectReason={rejectReason}
        onRejectReasonChange={setRejectReason}
        onReject={() =>
          rejectingId && rejectMutation.mutate({ id: rejectingId, reason: rejectReason })
        }
        rejectIsConfirming={rejectMutation.isPending}
      />
    </PageShell>
  );
};
