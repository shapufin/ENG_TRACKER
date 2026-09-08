import React, { useState } from "react";
import { useAuditLogs } from "@/hooks/useAuditLogs";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/DataTable";
import { PluginPermissionGuard } from "@/components/auth/PluginPermissionGuard";
import { type AuditLog } from "@/services/auditService";
import api from "@/lib/api";
import { downloadBlobResponse } from "@/lib/download";
import { handleApiError } from "@/lib/error-handler";
import { Download, Clock, Loader2 } from "lucide-react";
import { AuditLogStatsCards } from "./components/AuditLogStatsCards";
import { AuditLogFilters } from "./components/AuditLogFilters";
import { AuditLogDetailDialog } from "./components/AuditLogDetailDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuditLogColumns } from "./hooks/useAuditLogColumns";

export const AuditLogsEnhancedPage: React.FC = () => {
  const [filterAction, setFilterAction] = useState("all");
  const [filterModel, setFilterModel] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const { logs, isLoading, stats, statsLoading } = useAuditLogs({
    filterAction,
    filterModel,
    searchQuery,
  });
  const columns = useAuditLogColumns((log) => setSelectedLog(log));

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
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <PluginPermissionGuard pluginName="audit_log" action="view">
      <PageShell
        title="Audit Logs"
        subtitle="Monitor system activity and user actions"
        actions={
          <Button className="gap-2" onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export Logs
          </Button>
        }
      >
        <AuditLogStatsCards stats={stats} isLoading={statsLoading} />
        <AuditLogFilters
          filterAction={filterAction}
          onFilterActionChange={setFilterAction}
          filterModel={filterModel}
          onFilterModelChange={setFilterModel}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
        />
        <GlassCard>
          <div className="border-b border-border/60 p-4">
            <h3 className="text-sm font-semibold">Audit Logs</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Detailed record of all system activities
            </p>
          </div>
          <div className="p-4">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent" />
              </div>
            ) : logs.length === 0 ? (
              <EmptyState icon={Clock} title="No audit logs found" />
            ) : (
              <DataTable columns={columns} data={logs} />
            )}
          </div>
        </GlassCard>
        <GlassCard>
          <div className="border-b border-border/60 p-4">
            <h3 className="text-sm font-semibold">Configuration</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Audit log settings are managed at the system level
            </p>
          </div>
          <div className="p-4">
            <p className="text-sm text-muted-foreground">
              Contact your system administrator to modify audit log configuration settings.
            </p>
          </div>
        </GlassCard>
        <AuditLogDetailDialog log={selectedLog} onClose={() => setSelectedLog(null)} />
      </PageShell>
    </PluginPermissionGuard>
  );
};
