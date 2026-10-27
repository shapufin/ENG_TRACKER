import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuditLogs } from "@/hooks/useAuditLogs";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/DataTable";
import { PluginPermissionGuard } from "@/components/auth/PluginPermissionGuard";
import { auditService, type AuditLog } from "@/services/auditService";
import api from "@/lib/api";
import { downloadBlobResponse } from "@/lib/download";
import { handleApiError } from "@/lib/error-handler";
import { Download, Clock, Loader2, Archive } from "lucide-react";
import { toast } from "sonner";
import { AuditLogStatsCards } from "./components/AuditLogStatsCards";
import { AuditLogFilters } from "./components/AuditLogFilters";
import { AuditLogDetailDialog } from "./components/AuditLogDetailDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAuditLogColumns } from "./hooks/useAuditLogColumns";

export const AuditLogsEnhancedPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [filterAction, setFilterAction] = useState("all");
  const [filterModel, setFilterModel] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  const { logs, isLoading, stats, statsLoading } = useAuditLogs({
    filterAction,
    filterModel,
    searchQuery,
  });
  const columns = useAuditLogColumns((log) => setSelectedLog(log));

  const { data: archiveStatus, refetch: refetchArchiveStatus } = useQuery({
    queryKey: ["audit-logs", "archive-status"],
    queryFn: () => auditService.getArchiveStatus(),
  });

  const handleBlobError = async (error: unknown) => {
    // With responseType: "blob", error.response.data is a Blob (not JSON).
    // handleApiError expects JSON — convert blob errors before delegating.
    const axiosErr = error as { response?: { data?: Blob; status?: number } };
    if (axiosErr.response?.data instanceof Blob) {
      try {
        const errorText = await axiosErr.response.data.text();
        handleApiError({
          response: { data: JSON.parse(errorText), status: axiosErr.response.status },
        });
      } catch {
        handleApiError(error);
      }
    } else {
      handleApiError(error);
    }
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const params: Record<string, string> = {};
      if (filterAction !== "all") params.action = filterAction;
      if (filterModel !== "all") params.model_name = filterModel;
      if (searchQuery) params.search = searchQuery;
      const response = await api.get("/reports/audit-logs/export/", {
        params,
        responseType: "blob",
      });
      downloadBlobResponse(response.data, "audit_logs.csv");
    } catch (error) {
      await handleBlobError(error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleArchivePreviousMonth = async () => {
    try {
      setIsArchiving(true);
      const result = await auditService.archivePreviousMonth();
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
      refetchArchiveStatus();
      setIsArchiveDialogOpen(false);

      if (result.archived_count > 0 && result.filename) {
        toast.success(
          `Successfully compressed ${result.archived_count} logs into ${result.filename} and pruned them from the database.`
        );
        // Attempt download independently so a browser download block doesn't mask the successful archiving
        try {
          const blob = await auditService.downloadArchive(result.filename);
          downloadBlobResponse(blob, result.filename);
        } catch {
          toast.info(
            `Archive ${result.filename} saved on server. You can download it anytime from the archive list below.`
          );
        }
      } else {
        toast.info(result.message || "No logs available to archive for the previous month.");
      }
    } catch (err) {
      handleApiError(err);
    } finally {
      setIsArchiving(false);
    }
  };

  const handleDownloadExistingArchive = async (filename: string) => {
    try {
      const blob = await auditService.downloadArchive(filename);
      downloadBlobResponse(blob, filename);
      toast.success(`Downloaded ${filename}`);
    } catch (err) {
      await handleBlobError(err);
    }
  };

  return (
    <PluginPermissionGuard pluginName="audit_log" action="view">
      <PageShell
        title="Audit Logs"
        subtitle="Monitor system activity and user actions"
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="control"
              variant="outline"
              className="gap-2"
              onClick={() => {
                refetchArchiveStatus();
                setIsArchiveDialogOpen(true);
              }}
            >
              <Archive className="h-4 w-4" />
              Archive Previous Month
            </Button>
            <Button size="control" className="gap-2" onClick={handleExport} disabled={isExporting}>
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Export Logs
            </Button>
          </div>
        }
      >
        <AuditLogStatsCards stats={stats} isLoading={statsLoading} />
        <GlassCard>
          <div className="border-line-subtle border-b p-4">
            <AuditLogFilters
              filterAction={filterAction}
              onFilterActionChange={setFilterAction}
              filterModel={filterModel}
              onFilterModelChange={setFilterModel}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
            />
          </div>
          <div className="p-4">
            {isLoading ? (
              <div role="status" aria-label="Loading audit logs" className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-muted h-9 animate-pulse rounded" />
                ))}
              </div>
            ) : logs.length === 0 ? (
              <EmptyState icon={Clock} title="No audit logs found" />
            ) : (
              <DataTable columns={columns} data={logs} />
            )}
          </div>
        </GlassCard>
        <p className="text-muted-foreground text-xs">
          Audit log settings are managed at the system level. Contact your system administrator to
          modify audit log configuration.
        </p>
        <AuditLogDetailDialog log={selectedLog} onClose={() => setSelectedLog(null)} />
        <ConfirmDialog
          open={isArchiveDialogOpen}
          onOpenChange={setIsArchiveDialogOpen}
          title={`Archive & Rotate Logs for ${archiveStatus?.target_month_label || "Previous Month"}`}
          description={`Compress ${archiveStatus?.target_month_label || "previous month"} audit logs into a .json.gz archive and prune them from the live database to keep the database fast and compact.`}
          confirmLabel={
            archiveStatus && archiveStatus.eligible_count === 0
              ? "Archive (0 records)"
              : `Archive & Download (${archiveStatus?.eligible_count ?? 0} records)`
          }
          isConfirming={isArchiving}
          onConfirm={handleArchivePreviousMonth}
          icon={<Archive className="text-primary h-5 w-5" />}
          contextSlot={
            archiveStatus ? (
              <div className="bg-surface-sunken space-y-2 rounded-lg p-3 text-xs">
                <div className="flex justify-between font-medium">
                  <span className="text-muted-foreground">Target Period:</span>
                  <span>
                    {archiveStatus.target_month_label} ({archiveStatus.target_month})
                  </span>
                </div>
                <div className="flex justify-between font-medium">
                  <span className="text-muted-foreground">Eligible Logs:</span>
                  <span>
                    {archiveStatus.eligible_count} records (Core: {archiveStatus.core_count},
                    Plugin: {archiveStatus.plugin_count})
                  </span>
                </div>
                <div className="text-muted-foreground flex justify-between">
                  <span className="text-muted-foreground">Operation:</span>
                  <span>Compress to .json.gz &amp; prune database</span>
                </div>
                {archiveStatus.archives && archiveStatus.archives.length > 0 && (
                  <div className="border-line-subtle border-t pt-2">
                    <span className="text-muted-foreground font-medium">
                      Existing Archives ({archiveStatus.archives.length}):
                    </span>
                    <div className="mt-1 max-h-24 space-y-1 overflow-y-auto">
                      {archiveStatus.archives.map((a) => (
                        <div
                          key={a.filename}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="max-w-[180px] truncate font-mono">{a.filename}</span>
                          <button
                            type="button"
                            onClick={() => handleDownloadExistingArchive(a.filename)}
                            className="text-primary ml-2 hover:underline"
                          >
                            Download ({a.size_formatted})
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null
          }
        />
      </PageShell>
    </PluginPermissionGuard>
  );
};
