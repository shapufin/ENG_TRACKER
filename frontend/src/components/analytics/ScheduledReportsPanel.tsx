import React, { useState, useEffect } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Play, Clock, Mail } from "lucide-react";
import api from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface ScheduledReport {
  id: number;
  name: string;
  description: string;
  schedule_type: "daily" | "weekly" | "monthly";
  schedule_type_display?: string;
  recipients: string[];
  filter_preset: Record<string, unknown>;
  report_format: "excel" | "pdf" | "csv";
  report_format_display?: string;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
}

interface ScheduledReportsPanelProps {
  /** Current filter state — used as the preset for new scheduled reports. */
  currentFilters: Record<string, unknown>;
}

export const ScheduledReportsPanel: React.FC<ScheduledReportsPanelProps> = ({ currentFilters }) => {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [runResult, setRunResult] = useState<{ success: boolean; message: string } | null>(null);

  // Auto-clear run result after 5 seconds
  useEffect(() => {
    if (runResult) {
      const timer = setTimeout(() => setRunResult(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [runResult]);
  const [newReport, setNewReport] = useState<{
    name: string;
    description: string;
    schedule_type: "daily" | "weekly" | "monthly";
    recipients: string;
    report_format: "excel" | "csv";
  }>({
    name: "",
    description: "",
    schedule_type: "weekly",
    recipients: "",
    report_format: "excel",
  });

  const { data: reports = [] } = useQuery<ScheduledReport[]>({
    queryKey: ["scheduled-reports"],
    queryFn: async () => {
      const response = await api.get("plugins/analytics/scheduled-reports/");
      return response.data.results || response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      await api.post("plugins/analytics/scheduled-reports/", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-reports"] });
      setShowForm(false);
      setNewReport({
        name: "",
        description: "",
        schedule_type: "weekly",
        recipients: "",
        report_format: "excel",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`plugins/analytics/scheduled-reports/${id}/`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-reports"] });
    },
  });

  const runNowMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await api.post(`plugins/analytics/scheduled-reports/${id}/run_now/`);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-reports"] });
      setRunResult({ success: true, message: data?.detail || "Report sent." });
    },
    onError: (error: unknown) => {
      const detail =
        (error as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Failed to send report.";
      setRunResult({ success: false, message: detail });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (report: ScheduledReport) => {
      await api.patch(`plugins/analytics/scheduled-reports/${report.id}/`, {
        is_active: !report.is_active,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-reports"] });
    },
  });

  const handleCreate = () => {
    if (!newReport.name || !newReport.recipients) return;
    createMutation.mutate({
      name: newReport.name,
      description: newReport.description,
      schedule_type: newReport.schedule_type,
      recipients: newReport.recipients
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean),
      report_format: newReport.report_format,
      filter_preset: currentFilters,
      is_active: true,
    });
  };

  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Scheduled Reports</h3>
          {reports.length > 0 && (
            <span className="text-xs text-muted-foreground">{reports.length} scheduled</span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-xs"
          onClick={() => setShowForm(!showForm)}
        >
          <Plus className="h-3 w-3" />
          New
        </Button>
      </div>

      {showForm && (
        <div className="mt-3 space-y-3 rounded-lg border p-3">
          <div className="space-y-1">
            <Label className="text-xs">Report Name</Label>
            <Input
              className="h-8 text-sm"
              value={newReport.name}
              onChange={(e) => setNewReport({ ...newReport, name: e.target.value })}
              placeholder="Weekly OT Summary"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Schedule</Label>
              <Select
                value={newReport.schedule_type}
                onValueChange={(v: "daily" | "weekly" | "monthly") =>
                  setNewReport({ ...newReport, schedule_type: v })
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Format</Label>
              <Select
                value={newReport.report_format}
                onValueChange={(v: "excel" | "csv") =>
                  setNewReport({ ...newReport, report_format: v })
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="excel">Excel</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Recipients (comma-separated emails)</Label>
            <Input
              className="h-8 text-sm"
              value={newReport.recipients}
              onChange={(e) => setNewReport({ ...newReport, recipients: e.target.value })}
              placeholder="alice@company.com, bob@company.com"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleCreate}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </Button>
          </div>
          {createMutation.isError && (
            <p className="text-xs text-destructive">Failed to create report. Check permissions.</p>
          )}
        </div>
      )}

      {reports.length === 0 && !showForm ? (
        <p className="mt-3 text-xs text-muted-foreground">
          No scheduled reports. Create one to automate report delivery via email.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {reports.map((report) => (
            <div
              key={report.id}
              className="flex items-center justify-between rounded-lg border p-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium" title={report.name}>
                    {report.name}
                  </span>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {report.schedule_type_display || report.schedule_type}
                  </span>
                  {!report.is_active && (
                    <span className="shrink-0 text-xs text-muted-foreground">inactive</span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <Mail className="h-3 w-3" />
                  <span className="truncate">
                    {report.recipients.length} recipient{report.recipients.length !== 1 ? "s" : ""}
                  </span>
                  {report.last_run_at && (
                    <span className="truncate">
                      · last sent {new Date(report.last_run_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Switch
                  checked={report.is_active}
                  onCheckedChange={() => toggleActiveMutation.mutate(report)}
                  className="scale-75"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => runNowMutation.mutate(report.id)}
                  disabled={runNowMutation.isPending}
                  title="Run now"
                >
                  <Play className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-destructive"
                  onClick={() => {
                    if (window.confirm(`Delete scheduled report "${report.name}"?`)) {
                      deleteMutation.mutate(report.id);
                    }
                  }}
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {runResult && (
        <div
          className={`mt-2 rounded px-2 py-1.5 text-xs ${
            runResult.success
              ? "bg-success/10 text-foreground"
              : "bg-destructive/10 text-foreground"
          }`}
        >
          {runResult.message}
        </div>
      )}

      <div className="mt-3 border-t pt-2 text-xs text-muted-foreground">
        Automated delivery requires a cron job:{" "}
        <code className="rounded bg-muted px-1 py-0.5">python manage.py run_scheduled_reports</code>
      </div>
    </GlassCard>
  );
};
