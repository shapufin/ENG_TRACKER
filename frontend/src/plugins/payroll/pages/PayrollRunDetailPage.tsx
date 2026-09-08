/**
 * PayrollRunDetailPage — view, generate, finalize, and export a single run.
 * Orchestrator: fetches data and delegates rendering to sub-components.
 */
import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/layout/PageShell";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/GlassCard";
import { payrollService } from "../services/payrollService";
import { usePluginPermissions } from "@/hooks/usePluginPermissions";
import { toast } from "sonner";
import { handleApiError } from "@/lib/error-handler";
import { PayrollRunSummary } from "../components/PayrollRunSummary";
import { PayrollRunLinesTable } from "../components/PayrollRunLinesTable";
import { PayrollRunActions } from "../components/PayrollRunActions";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-primary/10 text-foreground",
  finalized: "bg-success/10 text-foreground",
  cancelled: "bg-muted text-foreground",
};

export const PayrollRunDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canManage, canExport } = usePluginPermissions();
  const canManagePayroll = canManage("payroll");
  const canExportPayroll = canExport("payroll");
  const runId = Number(id);

  const {
    data: run,
    isLoading: runLoading,
    error: runError,
    refetch,
  } = useQuery({
    queryKey: ["payroll-run", runId],
    queryFn: () => payrollService.getRun(runId),
    enabled: !!runId,
  });

  const { data: lines, isLoading: linesLoading } = useQuery({
    queryKey: ["payroll-run-lines", runId],
    queryFn: () => payrollService.getRunLines(runId),
    enabled: !!runId,
  });

  const {
    data: closureStatus,
    isLoading: closureStatusLoading,
    isError: closureStatusError,
  } = useQuery({
    queryKey: ["payroll-run-period-closure-status", runId],
    queryFn: () => payrollService.getPeriodClosureStatus(runId),
    enabled: !!runId && run?.status === "draft",
  });

  const generateMutation = useMutation({
    mutationFn: () => payrollService.generateRun(runId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-run", runId] });
      queryClient.invalidateQueries({ queryKey: ["payroll-run-lines", runId] });
      queryClient.invalidateQueries({ queryKey: ["payroll-run-period-closure-status", runId] });
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      toast.success("Payroll draft regenerated");
    },
    onError: (error) => handleApiError(error),
  });

  const finalizeMutation = useMutation({
    mutationFn: () => payrollService.finalizeRun(runId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-run", runId] });
      queryClient.invalidateQueries({ queryKey: ["payroll-run-lines", runId] });
      queryClient.invalidateQueries({ queryKey: ["payroll-run-period-closure-status", runId] });
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      toast.success("Payroll run finalized");
    },
    onError: (error) => handleApiError(error),
  });

  const deleteMutation = useMutation({
    mutationFn: () => payrollService.deleteRun(runId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      toast.success("Draft payroll run deleted");
      navigate("/admin/payroll/runs");
    },
    onError: (error) => handleApiError(error),
  });

  const exportMutation = useMutation({
    mutationFn: () => payrollService.exportRunExcel(runId),
    onSuccess: () => toast.success("Excel export downloaded"),
    onError: () => toast.error("Excel export failed"),
  });

  const payslipMutation = useMutation({
    mutationFn: (lineId: number) => payrollService.downloadPayslip(runId, lineId),
    onSuccess: () => toast.success("Payslip downloaded"),
    onError: () => toast.error("Payslip download failed"),
  });

  const generateLineMutation = useMutation({
    mutationFn: (userId: number) => payrollService.generateLine(runId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-run", runId] });
      queryClient.invalidateQueries({ queryKey: ["payroll-run-lines", runId] });
      queryClient.invalidateQueries({ queryKey: ["payroll-run-period-closure-status", runId] });
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      toast.success("Employee payroll regenerated");
    },
    onError: (error) => handleApiError(error),
  });

  if (runLoading) return <LoadingCard rows={4} className="min-h-[300px]" />;
  if (runError || !run) return <ErrorCard title="Failed to load payroll run" onRetry={refetch} />;

  const isDraft = run.status === "draft";

  return (
    <PageShell
      title={`Payroll Run ${run.year}-${String(run.month).padStart(2, "0")}`}
      subtitle={`Rule set: ${run.rule_set_name}`}
      actions={
        <PayrollRunActions
          isDraft={isDraft}
          lineCount={run.line_count}
          canManage={canManagePayroll}
          canExport={canExportPayroll}
          closureStatus={closureStatus}
          onGenerate={() => generateMutation.mutate()}
          onFinalize={() => finalizeMutation.mutate()}
          onDelete={() => deleteMutation.mutate()}
          onExport={() => exportMutation.mutate()}
          generateLoading={generateMutation.isPending}
          deleteLoading={deleteMutation.isPending}
          exportLoading={exportMutation.isPending}
        />
      }
    >
      <div className="mb-4">
        <Badge className={STATUS_COLORS[run.status] ?? ""}>{run.status}</Badge>
      </div>

      {isDraft && (
        <GlassCard
          isHoverLift={false}
          role="status"
          aria-label="Payroll closure status"
          className={`mb-6 p-4 ${
            closureStatus?.all_closed
              ? "border-success/40 bg-success/10"
              : "border-warning/40 bg-warning/10"
          }`}
        >
          {closureStatusLoading && (
            <p className="text-sm text-muted-foreground">Checking team-leader closure status...</p>
          )}
          {closureStatusError && (
            <p className="text-sm text-foreground">
              Team-leader closure status is unavailable. Finalization readiness could not be
              verified.
            </p>
          )}
          {closureStatus && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  className={
                    closureStatus.all_closed
                      ? "bg-success/10 text-foreground"
                      : "bg-warning/10 text-foreground"
                  }
                >
                  {closureStatus.all_closed ? "All TL scopes closed" : "TL scopes unclosed"}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {closureStatus.closed_users} of {closureStatus.total_users} users closed
                </span>
              </div>
              {!closureStatus.all_closed && closureStatus.unclosed_users.length > 0 && (
                <p className="mt-2 text-sm text-foreground">
                  Unclosed users:{" "}
                  {closureStatus.unclosed_users.map((user) => user.username).join(", ")}
                </p>
              )}
            </>
          )}
        </GlassCard>
      )}

      <PayrollRunSummary totals={run.totals || {}} />

      <PayrollRunLinesTable
        lines={lines}
        isLoading={linesLoading}
        isDraft={isDraft}
        canExport={canExportPayroll}
        canManage={canManagePayroll}
        onPayslipDownload={(lineId) => payslipMutation.mutate(lineId)}
        payslipLoading={payslipMutation.isPending}
        payslipLoadingId={payslipMutation.variables ?? null}
        onGenerateLine={(userId) => generateLineMutation.mutate(userId)}
        generateLineLoading={generateLineMutation.isPending}
        generatingUserId={generateLineMutation.variables ?? null}
      />
    </PageShell>
  );
};
