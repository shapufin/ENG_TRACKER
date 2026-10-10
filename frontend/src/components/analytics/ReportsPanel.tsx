import React, { useState, useEffect } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, FileSpreadsheet, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import api from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatBytes, type ExportJob } from "@/lib/analyticsExports";

interface ReportsPanelProps {
  /** Current filter state — used as the filter params for new export jobs. */
  currentFilters: {
    period: string;
    date_from?: string;
    date_to?: string;
    teams: string[];
    users: string[];
    statuses: string[];
    categories: string[];
  };
}

const STATUS_ICONS: Record<ExportJob["status"], React.ReactNode> = {
  pending: <Loader2 className="text-muted-foreground h-3 w-3 animate-spin" />,
  running: <Loader2 className="text-primary h-3 w-3 animate-spin" />,
  completed: <CheckCircle2 className="text-success h-3 w-3" />,
  failed: <AlertCircle className="text-destructive h-3 w-3" />,
};

export const ReportsPanel: React.FC<ReportsPanelProps> = ({ currentFilters }) => {
  const queryClient = useQueryClient();
  const [exportFormat, setExportFormat] = useState<"excel" | "csv">("excel");
  const [watchedJobId, setWatchedJobId] = useState<number | null>(null);

  const { data: jobs = [] } = useQuery<ExportJob[]>({
    queryKey: ["export-jobs"],
    queryFn: async () => {
      const response = await api.get("plugins/analytics/metrics/export-jobs/");
      return response.data.results || [];
    },
    // Poll every 2s while we have a pending/running watched job
    refetchInterval: (query) => {
      if (!watchedJobId) return false;
      const data = query.state.data;
      if (!data) return false;
      const watched = data.find((j) => j.job_id === watchedJobId);
      return watched && (watched.status === "pending" || watched.status === "running")
        ? 2000
        : false;
    },
  });

  // Derive whether the watched job is done
  const watchedJob = watchedJobId ? jobs.find((j) => j.job_id === watchedJobId) : null;
  const watchedJobDone =
    watchedJob !== null &&
    watchedJob !== undefined &&
    (watchedJob.status === "completed" || watchedJob.status === "failed");

  // Fire toast + stop polling when the watched job finishes.
  // setState here is intentional — we need to stop polling once the job is done.
  useEffect(() => {
    if (!watchedJobDone || !watchedJob) return;
    if (watchedJob.status === "completed") {
      toast.success("Export ready! Click download to save the file.");
    } else if (watchedJob.status === "failed") {
      toast.error(`Export failed: ${watchedJob.error_message || "Unknown error"}`);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWatchedJobId(null);
  }, [watchedJobDone, watchedJob]);

  const createJobMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post("plugins/analytics/metrics/export-jobs/create/", {
        format: exportFormat,
        ...currentFilters,
      });
      return response.data as { job_id: number; status: string };
    },
    onSuccess: (data) => {
      setWatchedJobId(data.job_id);
      queryClient.invalidateQueries({ queryKey: ["export-jobs"] });
      toast.success("Export job started. You'll be notified when it's ready.");
    },
    onError: () => {
      toast.error("Failed to start export job.");
    },
  });

  const handleDownload = async (jobId: number) => {
    try {
      const response = await api.get(`plugins/analytics/metrics/export-jobs/${jobId}/download/`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `analytics_export_${jobId}.${exportFormat === "excel" ? "xlsx" : "csv"}`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Download failed.");
    }
  };

  const isCreating = createJobMutation.isPending || watchedJobId !== null;

  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="text-primary h-4 w-4" />
          <h3 className="text-sm font-semibold">Background Exports</h3>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={exportFormat}
            onValueChange={(v: "excel" | "csv") => setExportFormat(v)}
            disabled={isCreating}
          >
            <SelectTrigger className="h-7 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="excel">Excel</SelectItem>
              <SelectItem value="csv">CSV</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => createJobMutation.mutate()}
            disabled={isCreating}
          >
            {isCreating ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Download className="h-3 w-3" />
                Generate
              </>
            )}
          </Button>
        </div>
      </div>

      <p className="text-muted-foreground mt-2 text-xs">
        Generate large reports in the background. The file will download automatically when ready.
      </p>

      {jobs.length > 0 && (
        <div className="mt-3 space-y-2">
          {jobs.map((job) => (
            <div
              key={job.job_id}
              className="flex items-center justify-between rounded-lg border p-2.5"
            >
              <div className="flex items-center gap-2">
                {STATUS_ICONS[job.status]}
                <div>
                  <div className="text-sm font-medium">Export #{job.job_id}</div>
                  <div className="text-muted-foreground text-xs">
                    {job.format.toUpperCase()} · {formatBytes(job.file_size_bytes)}
                    {job.error_message && ` · ${job.error_message}`}
                  </div>
                </div>
              </div>
              {job.status === "completed" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-xs"
                  onClick={() => handleDownload(job.job_id)}
                >
                  <Download className="h-3 w-3" />
                  Download
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
};
