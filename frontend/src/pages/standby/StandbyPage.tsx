import React from "react";
import { useStandbyQueries } from "@/hooks/useStandbyQueries";
import { standbyService } from "@/services/standbyService";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/PageShell";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Plus, CalendarDays } from "lucide-react";
import type { StandbyLog } from "@/types";
import { useBulkOperations } from "@/hooks/useBulkOperations";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import { useStandbyForm } from "./hooks/useStandbyForm";
import { useStandbyColumns } from "./hooks/useStandbyColumns";
import { StandbyFormDialog } from "./components/StandbyFormDialog";
import { WeeklyGeneratorDialog } from "./components/WeeklyGeneratorDialog";
import { useHoursLogPageSetup } from "@/pages/hours_logs/components/useHoursLogPageSetup";
import { useHoursLogPageContext } from "@/pages/hours_logs/components/useHoursLogPageContext";
import { useHoursLogSubmit } from "@/pages/hours_logs/components/useHoursLogSubmit";
import { HoursLogExportButtons } from "@/pages/hours_logs/components/HoursLogExportButtons";
import { HoursLogDataTable } from "@/pages/hours_logs/components/HoursLogDataTable";
import { DateRangeHistoryButton } from "@/pages/hours_logs/components/DateRangeHistoryButton";
import { HoursLogBulkActionBar } from "@/pages/hours_logs/components/HoursLogDialogs";
import { HoursLogConfirmDialogs } from "@/pages/hours_logs/components/HoursLogConfirmDialogs";

// fallow-ignore-next-line complexity
export const StandbyPage: React.FC = () => {
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
    weeklyOpen,
    setWeeklyOpen,
    weeklyForm,
    weeklyPreview,
    patchWeeklyForm,
    resetWeeklyForm,
    updatePreviewRow,
    resetPreviewRow,
  } = useStandbyForm();

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
    users,
    clients,
    isLoading,
    createMutation,
    updateMutation,
    deleteMutation,
    approveMutation,
    rejectMutation,
    createWeeklyMutation,
    refetchStandbyData,
    logsQueryKey,
    dateParams,
  } = useStandbyQueries({
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
      await refetchStandbyData();
    },
    deleteFn: standbyService.bulkDelete,
  });

  const handleSubmit = useHoursLogSubmit<StandbyLog>({
    validateForm,
    buildPayload,
    editing,
    form,
    isAdmin,
    updateMutation,
    createMutation,
  });

  const columns = useStandbyColumns(
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
        title="Failed to load standby logs"
        onRetry={() => queryClient.invalidateQueries({ queryKey: ["standby"] })}
      />
    );

  return (
    <PageShell
      title="Standby"
      subtitle={
        customDateRange
          ? `Showing ${customDateRange.from} to ${customDateRange.to}`
          : "Showing current month"
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <DateRangeHistoryButton customDateRange={customDateRange} onApply={setCustomDateRange} />
          <Button
            variant="outline"
            onClick={() => {
              resetWeeklyForm();
              setWeeklyOpen(true);
            }}
          >
            <CalendarDays className="mr-2 h-4 w-4" /> Generate Weekly
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Add Entry
          </Button>
        </div>
      }
    >
      <HoursLogExportButtons
        logs={logs}
        filename="standby-logs"
        csvHeaders={["User", "Date", "Hours", "Status", "Description"]}
        rowMapper={(l) => [
          l.user_name || "",
          formatDateDDMMYYYY(l.date),
          String(Number(l.hours)),
          l.status,
          l.description || "",
        ]}
        onFetchAll={async () => {
          const all = await standbyService.downloadAllLogs(dateParams);
          return userId ? all.filter((l) => l.user === userId) : all;
        }}
        onExportCsv={async () => {
          const exportParams = userId ? { ...dateParams, user: String(userId) } : dateParams;
          await standbyService.exportCsv(exportParams);
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
        storageKey="table-visibility-standby-page"
        {...(canApprove && {
          searchColumn: "user_full_name",
          searchPlaceholder: "Search by employee...",
        })}
      />

      <StandbyFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={!!editing}
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

      <WeeklyGeneratorDialog
        open={weeklyOpen}
        onOpenChange={setWeeklyOpen}
        weeklyForm={weeklyForm}
        weeklyPreview={weeklyPreview}
        users={users?.results}
        clients={clients}
        isAdmin={isAdmin}
        isSubmitting={createWeeklyMutation.isPending}
        onSubmit={(e) => {
          e.preventDefault();
          if (weeklyPreview.length === 0) return;
          const entries = weeklyPreview.map((p) => {
            const entry: Record<string, unknown> = {
              date: p.date,
              start_time: p.start,
              end_time: p.end,
              hours: p.hours,
              description: weeklyForm.description,
              client_ids: weeklyForm.client_ids,
            };
            if (weeklyForm.user && isAdmin) entry.user = Number(weeklyForm.user);
            return entry as Parameters<typeof standbyService.createLog>[0];
          });
          createWeeklyMutation.mutate(entries, {
            onSuccess: () => setWeeklyOpen(false),
          });
        }}
        onPatchWeeklyForm={patchWeeklyForm}
        onUpdatePreviewRow={updatePreviewRow}
        onResetPreviewRow={resetPreviewRow}
      />

      <HoursLogConfirmDialogs
        deleteOpen={deleteOpen}
        setDeleteOpen={setDeleteOpen}
        deleteTitle="Delete Entry"
        deleteDescription="Delete this standby entry?"
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
