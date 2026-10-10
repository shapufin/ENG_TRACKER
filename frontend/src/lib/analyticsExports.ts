export interface ExportJob {
  job_id: number;
  status: "pending" | "running" | "completed" | "failed";
  format: "excel" | "csv";
  file_size_bytes: number;
  error_message: string | null;
  created_at: string | null;
  completed_at: string | null;
}

export interface ScheduledReport {
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

export function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
