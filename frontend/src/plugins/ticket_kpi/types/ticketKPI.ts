export interface ExportProfile {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  field_mapping: Record<string, string>;
  value_transforms: Record<string, Record<string, string>>;
  required_fields: string[];
  compute_resolution_time: boolean;
  compute_sla: boolean;
  is_global: boolean;
  assigned_client_ids?: number[];
  created_by_username?: string;
  created_at: string;
  updated_at: string;
}

export interface TicketSearchResult {
  id: number;
  ticket_id: string;
  title: string;
  status: string;
  batch_month: string;
}

export interface TicketOvertimeLink {
  id: number;
  overtime_log: number;
  normalized_ticket: number;
  linked_by: number | null;
  linked_by_username: string;
  linked_at: string;
  link_method: "manual" | "auto";
  review_status: "confirmed" | "pending" | "rejected";
  reviewed_by: number | null;
  reviewed_at: string | null;
  note: string;
  overtime_user: string;
  overtime_date: string;
  overtime_hours: string;
  overtime_client_name: string;
  ticket_id: string;
  ticket_title: string;
  ticket_status: string;
  batch_month: string;
}

export interface TicketImportBatch {
  id: number;
  user: number;
  username?: string;
  month: string;
  profile: number;
  profile_name?: string;
  raw_file?: string;
  record_count: number;
  is_overridden: boolean;
  overridden_by?: number;
  overridden_at?: string;
  created_at: string;
}

export interface MonthlyKPI {
  id?: number;
  has_data?: boolean;
  month: string;
  total_tickets: number;
  closed_tickets: number;
  open_tickets: number;
  avg_resolution_hours?: number;
  min_resolution_hours?: number;
  max_resolution_hours?: number;
  p50_resolution_hours?: number;
  p75_resolution_hours?: number;
  p90_resolution_hours?: number;
  sla_compliance_pct?: number;
  sla_breached_count: number;
  by_category: Record<string, number>;
  by_priority: Record<string, number>;
  by_status: Record<string, number>;
  field_breakdowns?: Record<string, Record<string, number>>;
  comparison?: MonthlyKPIComparison | null;
}

/** Period-over-period comparison payload from the `compare_month` param. */
export interface MonthlyKPIComparison {
  month: string;
  has_data: boolean;
  total_tickets: number;
  closed_tickets: number;
  avg_resolution_hours?: number;
  p50_resolution_hours?: number;
  p90_resolution_hours?: number;
  sla_compliance_pct?: number;
  /** Delta = current - previous. null when either side lacks data. */
  total_tickets_delta?: number | null;
  closed_tickets_delta?: number | null;
  avg_resolution_delta?: number | null;
  p50_resolution_delta?: number | null;
  p90_resolution_delta?: number | null;
  sla_compliance_delta?: number | null;
}

export interface UploadPreview {
  total_records: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  preview_rows: Record<string, any>[];
  issues: Record<string, number>;
  status_breakdown: Record<string, number>;
  priority_breakdown: Record<string, number>;
  category_breakdown: Record<string, number>;
  errors: string[];
  has_existing_upload?: boolean;
  existing_record_count?: number;
  profile_id?: number;
}

export interface AnalyzeResponse {
  detected_columns: string[];
  suggested_mapping: Record<string, string>;
  total_rows: number;
  suggested_profile?: {
    id: number;
    name: string;
    match_score: number;
  };
}

export type EvidenceType = "document" | "certificate" | "email_thread" | "screenshot" | "other";

export type EvidenceStatus = "pending" | "approved" | "rejected";

export interface EmailPreview {
  subject?: string;
  from?: string | null;
  to?: string[];
  cc?: string[];
  date?: string | null;
  body_plain?: string;
  body_html?: string;
  attachments?: Array<{ filename: string; size: number }>;
}

export interface KPIEvidence {
  id: number;
  user: number;
  username?: string;
  month: string;
  clients: { id: number; name: string; code?: string }[];
  client_ids?: number[];
  evidence_type: EvidenceType;
  file?: string;
  file_url?: string | null;
  file_name?: string | null;
  description: string;
  status: EvidenceStatus;
  reviewed_by?: number | null;
  reviewed_by_username?: string | null;
  reviewed_at?: string | null;
  parsed_email?: EmailPreview;
  created_at: string;
  updated_at: string;
}

export interface YearlyReport {
  year: number;
  users_with_data: number;
  total_tickets: number;
  avg_resolution_hours?: number;
  sla_compliance_pct?: number;
  monthly_breakdown: Array<{
    month: string;
    total_tickets: number;
    avg_resolution_hours?: number;
    sla_compliance_pct?: number;
  }>;
  per_user_summary: Array<{
    user_id: number;
    username: string;
    name: string;
    total_tickets: number;
    avg_resolution_hours?: number;
    sla_compliance_pct?: number;
  }>;
}

/** A single normalized ticket row (matches NormalizedTicketSerializer). */
export interface TicketRecord {
  id: number;
  batch: number;
  row_index: number;
  ticket_id: string;
  title: string;
  status: string;
  created_at: string | null;
  resolved_at: string | null;
  assignee: string;
  requester: string;
  priority: string;
  category: string;
  time_to_resolution_hours: number | null;
  sla_breached: boolean | null;
  /** Complete row data from the uploaded file (all columns). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw_data: Record<string, any>;
}

/** Distinct values for the server-side filter dropdowns.
 *  Standard fields have fixed keys; dynamic/raw_data fields are included
 *  as additional keys (e.g. `operatore`, `caller`, etc.). */
export interface TicketFilterOptions {
  status: string[];
  priority: string[];
  category: string[];
  assignee: string[];
  requester: string[];
  // Dynamic field keys from raw_data — values are distinct strings.
  [key: string]: string[];
}

/** Response shape from the `dashboard/tickets/` endpoint. */
export interface TicketListResponse {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: TicketRecord[];
  /** Ordered union of standard fields + every raw_data column discovered. */
  available_fields: string[];
  filter_options: TicketFilterOptions;
}

/** Filter parameters for the ticket records query. */
export interface TicketQueryFilters {
  status?: string;
  priority?: string;
  category?: string;
  assignee?: string;
  requester?: string;
  search?: string;
  sla_breached?: boolean;
  /** Dynamic field filters keyed by raw_data column name. */
  dynamicFields?: Record<string, string>;
}
