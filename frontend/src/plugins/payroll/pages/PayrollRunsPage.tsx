/**
 * PayrollRunsPage — list and manage monthly payroll runs.
 */
import React, { useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { DataTable } from "@/components/ui/DataTable";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { payrollService } from "../services/payrollService";
import type { PayrollRun } from "../types";
import { usePluginPermissions } from "@/hooks/usePluginPermissions";
import { handleApiError } from "@/lib/error-handler";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-primary/10 text-foreground",
  finalized: "bg-success/10 text-foreground",
  cancelled: "bg-muted text-foreground",
};

export const PayrollRunsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { canManage } = usePluginPermissions();
  const canManagePayroll = canManage("payroll");
  const [createOpen, setCreateOpen] = useState(false);
  const [newYear, setNewYear] = useState(new Date().getFullYear());
  const [newMonth, setNewMonth] = useState(new Date().getMonth() + 1);

  const {
    data: runs,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["payroll-runs", { year: undefined, month: undefined }],
    queryFn: () => payrollService.getRuns(),
  });

  const createMutation = useMutation({
    mutationFn: () => payrollService.createRun({ year: newYear, month: newMonth }),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      setCreateOpen(false);
      toast.success("Payroll run created");
      navigate(`${location.pathname}/${run.id}`);
    },
    onError: (error) => handleApiError(error),
  });

  const columns = useMemo<ColumnDef<PayrollRun>[]>(
    () => [
      {
        id: "period",
        header: "Period",
        cell: ({ row }) => (
          <span className="text-base font-semibold">
            {row.original.year}-{String(row.original.month).padStart(2, "0")}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge className={cn(STATUS_COLORS[row.original.status] ?? "", "capitalize")}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: "line_count",
        header: "Employees",
      },
      {
        id: "net",
        header: "Net",
        cell: ({ row }) =>
          row.original.totals?.total_net
            ? `${Number(row.original.totals.total_net).toLocaleString()} Lek`
            : "—",
      },
      {
        accessorKey: "rule_set_name",
        header: "Rule Set",
      },
    ],
    []
  );

  if (isLoading) return <LoadingCard rows={4} className="min-h-[300px]" />;
  if (error) return <ErrorCard title="Failed to load payroll runs" onRetry={refetch} />;

  return (
    <PageShell
      title="Payroll Runs"
      subtitle="Monthly payroll calculation runs"
      actions={
        canManagePayroll ? (
          <Button onClick={() => setCreateOpen(true)}>New Payroll Run</Button>
        ) : undefined
      }
    >
      <GlassCard className="p-6">
        <DataTable
          columns={columns}
          data={runs ?? []}
          getRowId={(row) => String(row.id)}
          onRowClick={(run) => navigate(`${location.pathname}/${run.id}`)}
          emptyMessage="No payroll runs yet. Create one to get started."
        />
      </GlassCard>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader className="shrink-0">
            <DialogTitle>New Payroll Run</DialogTitle>
            <DialogDescription>Start a new payroll run for a processing period.</DialogDescription>
          </DialogHeader>
          <div className="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  type="number"
                  value={newYear}
                  onChange={(e) => setNewYear(Number(e.target.value))}
                />
              </div>
              <div>
                <Label htmlFor="month">Month</Label>
                <Input
                  id="month"
                  type="number"
                  min={1}
                  max={12}
                  value={newMonth}
                  onChange={(e) => setNewMonth(Number(e.target.value))}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t pt-4">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Run"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
};
