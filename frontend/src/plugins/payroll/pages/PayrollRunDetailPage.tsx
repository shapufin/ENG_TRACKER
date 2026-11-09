/**
 * PayrollRunDetailPage — view, generate, finalize, and export a single run.
 * Orchestrator: fetches data and delegates rendering to sub-components.
 */
import React, { useMemo } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/layout/PageShell";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/GlassCard";
import { payrollService, describeSkippedUsers } from "../services/payrollService";
import { usePluginPermissions } from "@/hooks/usePluginPermissions";
import { usePayrollRunScope } from "../hooks/usePayrollRunScope";
import { AutomatedLifecycleNotice } from "../components/AutomatedLifecycleNotice";
import { toast } from "sonner";
import { handleApiError } from "@/lib/error-handler";
import { PayrollRunSummary } from "../components/PayrollRunSummary";
import { PayrollRunLinesTable } from "../components/PayrollRunLinesTable";
import { PayrollRunActions } from "../components/PayrollRunActions";
import type { LineManagerClosure } from "../types";

const lineManagerName = (lm: LineManagerClosure) =>
  lm.id === null && !lm.username ? "No Line Manager" : lm.full_name;

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-primary/10 text-foreground",
  finalized: "bg-success/10 text-foreground",
  cancelled: "bg-muted text-foreground",
};

export const PayrollRunDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  // Route is a flat, path-contributing leaf under pathless layout routes
  // (ProtectedRoute/AppShell/HRRoute or SuperuserRoute/AdminShell), so
  // relative navigate("..") has no path-contributing ancestor to resolve
  // against and would land on "/" instead of the runs list. Derive the
  // list path from the current URL instead — works under both
  // /admin/payroll/runs/:id and /hr/payroll/runs/:id.
  const runsListPath = location.pathname.slice(0, location.pathname.lastIndexOf("/"));
  const queryClient = useQueryClient();
  const { canManage, canExport } = usePluginPermissions();
  const { isCompanyScope, canMutateRuns } = usePayrollRunScope();
  // Whole-run actions (regenerate, finalize, delete, exports) and per-line
  // regenerate act on every team's lines, so team-scoped viewers never see them.
  const canManagePayroll = canManage("payroll") && isCompanyScope && canMutateRuns;
  const canExportPayroll = canExport("payroll") && isCompanyScope;
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

  const lineManagers: LineManagerClosure[] = useMemo(() => {
    if (!closureStatus) return [];
    if (closureStatus.line_managers && closureStatus.line_managers.length > 0) {
      return closureStatus.line_managers;
    }
    // Fallback: group unclosed_users by line_manager if line_managers is omitted
    const groups = new Map<string, LineManagerClosure>();
    for (const u of closureStatus.unclosed_users) {
      const key = u.line_manager || "unassigned";
      if (!groups.has(key)) {
        groups.set(key, {
          id: null,
          username: u.line_manager,
          full_name: u.line_manager ? `@${u.line_manager}` : "Unassigned",
          total_members: 0,
          closed_members: 0,
          all_closed: false,
          unclosed_users: [],
        });
      }
      const entry = groups.get(key)!;
      entry.total_members += 1;
      entry.unclosed_users.push(u);
    }
    return Array.from(groups.values());
  }, [closureStatus]);
  const pendingLineManagers = lineManagers.filter((lm) => !lm.all_closed);

  const generateMutation = useMutation({
    mutationFn: () => payrollService.generateRun(runId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["payroll-run", runId] });
      queryClient.invalidateQueries({ queryKey: ["payroll-run-lines", runId] });
      queryClient.invalidateQueries({ queryKey: ["payroll-run-period-closure-status", runId] });
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      const skippedDetail = describeSkippedUsers(data.skipped_users);
      if (skippedDetail) {
        toast.warning(`Regenerated — ${data.skipped_users.length} employee(s) skipped`, {
          description: skippedDetail,
        });
      } else {
        toast.success("Payroll draft regenerated");
      }
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
      navigate(runsListPath);
    },
    onError: (error) => handleApiError(error),
  });

  const exportMutation = useMutation({
    mutationFn: () => payrollService.exportRunExcel(runId),
    onSuccess: () => toast.success("Excel export downloaded"),
    onError: () => toast.error("Excel export failed"),
  });

  const exportPdfMutation = useMutation({
    mutationFn: () => payrollService.exportRunPdf(runId),
    onSuccess: () => toast.success("PDF export downloaded"),
    onError: () => toast.error("PDF export failed"),
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
          onBack={() => navigate(runsListPath)}
          isDraft={isDraft}
          lineCount={run.line_count}
          canManage={canManagePayroll}
          canExport={canExportPayroll}
          closureStatus={closureStatus}
          ruleSetId={run.rule_set}
          onGenerate={() => generateMutation.mutate()}
          onFinalize={() => finalizeMutation.mutate()}
          onDelete={() => deleteMutation.mutate()}
          onExport={() => exportMutation.mutate()}
          onExportPdf={() => exportPdfMutation.mutate()}
          generateLoading={generateMutation.isPending}
          deleteLoading={deleteMutation.isPending}
          exportLoading={exportMutation.isPending}
          exportPdfLoading={exportPdfMutation.isPending}
        />
      }
    >
      <div className="mb-4">
        <Badge className={STATUS_COLORS[run.status] ?? ""}>{run.status}</Badge>
      </div>

      {isDraft && <AutomatedLifecycleNotice />}

      {isDraft && (
        <GlassCard
          role="status"
          aria-label="Payroll closure status"
          className={`mb-6 p-4 ${
            closureStatus?.all_closed
              ? "border-success/40 bg-success/10"
              : "border-warning/40 bg-warning/10"
          }`}
        >
          {closureStatusLoading && (
            <p className="text-muted-foreground text-sm">Checking team-leader closure status...</p>
          )}
          {closureStatusError && (
            <p className="text-foreground text-sm">
              Team-leader closure status is unavailable. Finalization readiness could not be
              verified.
            </p>
          )}
          {closureStatus && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
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
                  <span className="text-muted-foreground text-sm">
                    {closureStatus.closed_users} of {closureStatus.total_users} users closed
                  </span>
                </div>
                {lineManagers.length > 0 && (
                  <span className="text-muted-foreground text-xs font-medium">
                    Line Managers finalized:{" "}
                    <span className="text-foreground font-semibold">
                      {lineManagers.filter((lm) => lm.all_closed).length}/{lineManagers.length}
                    </span>
                  </span>
                )}
              </div>

              {!closureStatus.all_closed && closureStatus.cutoff_passed && (
                <p className="text-foreground text-sm">
                  Month cutoff reached. Finalizing closes the remaining users automatically.
                </p>
              )}

              {pendingLineManagers.length > 0 && (
                <div className="mt-2 space-y-2">
                  <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                    Line Managers yet to finalize
                  </p>
                  <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {pendingLineManagers.map((lm) => (
                      <details
                        key={lm.username || lm.full_name}
                        className="border-warning/30 bg-warning/5 rounded-lg border text-xs"
                      >
                        <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2">
                          <span
                            className="text-foreground truncate font-semibold"
                            title={lineManagerName(lm)}
                          >
                            {lineManagerName(lm)}
                          </span>
                          <Badge
                            variant="outline"
                            className="border-warning/40 bg-warning/15 text-foreground text-xs"
                          >
                            {lm.closed_members}/{lm.total_members} closed
                          </Badge>
                        </summary>
                        {lm.unclosed_users.length > 0 && (
                          <p className="border-border/50 text-muted-foreground border-t px-3 py-2 text-xs">
                            <span className="text-foreground font-semibold">Pending: </span>
                            {lm.unclosed_users.map((u) => u.username).join(", ")}
                          </p>
                        )}
                      </details>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </GlassCard>
      )}

      <PayrollRunSummary totals={run.totals || {}} />

      <PayrollRunLinesTable
        lines={lines}
        isLoading={linesLoading}
        isDraft={isDraft}
        canExport={canExportPayroll}
        canManage={canManage("payroll") && canMutateRuns}
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
