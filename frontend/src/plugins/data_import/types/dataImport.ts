export interface ImportField {
  key: string;
  label: string;
  required: boolean;
  field_type: "string" | "email" | "date" | "decimal" | "integer" | "bool" | "choice" | "password";
  choices?: [string, string][];
  help_text?: string;
}

/** One import option, rendered generically from the importer's schema. */
export interface ImportOption {
  key: string;
  label: string;
  option_type: "bool" | "string" | "secret" | "choice";
  default: unknown;
  choices?: [string, string][] | null;
  help_text?: string;
  /** Show this option only while every listed option holds the given value. */
  depends_on?: Record<string, unknown> | null;
}

export interface ImportTarget {
  target_key: string;
  display_name: string;
  description: string;
  /** Plugin permission action guarding this target. */
  permission_scope: string;
  /** lucide-react icon name for the target picker. */
  icon: string;
  /** Admin route that owns this data. */
  page_route: string;
  fields: ImportField[];
  options: ImportOption[];
  sample_rows: Record<string, unknown>[];
  dedupe_keys: string[];
}

export type TemplateFormat = "csv" | "xlsx";

export interface ImportProfile {
  id: number;
  name: string;
  target_key: string;
  field_mapping: Record<string, string>;
  default_values: Record<string, unknown>;
  options: ImportOptions;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export type PasswordStrategy = "fixed" | "generate" | "column";

/**
 * Option values are keyed by the importer's option schema, so the shape is
 * open: a new target's options need no change here. `value_transforms` is the
 * one option the wizard itself writes, so it stays named.
 */
export interface ImportOptions extends Record<string, unknown> {
  value_transforms?: Record<string, Record<string, string>>;
}

export interface AnalyzeResult {
  target_key: string;
  filename: string;
  detected_columns: string[];
  detected_values?: Record<string, string[]>;
  suggested_mapping: Record<string, string>;
  profiles: ImportProfile[];
  total_rows: number;
}

export interface PreviewRow {
  row_index: number;
  status: "valid" | "created" | "updated" | "skipped" | "error";
  errors: string[];
  warnings: string[];
  preview: Record<string, unknown>;
}

export interface PreviewResult {
  summary: {
    total: number;
    valid: number;
    warning: number;
    error: number;
    skipped: number;
  };
  rows: PreviewRow[];
  total_rows: number;
}

export interface CredentialRow {
  username: string;
  email: string;
  password: string;
  generated: boolean;
}

export interface CommitResult {
  summary: {
    total: number;
    created: number;
    updated: number;
    skipped: number;
    error: number;
  };
  row_errors: { row_index: number; errors: string[] }[];
  credentials: CredentialRow[];
}

export interface ImportBatch {
  id: number;
  target_key: string;
  profile: ImportProfile | null;
  original_filename: string;
  total_rows: number;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
  row_errors: { row_index: number; errors: string[] }[];
  created_at: string;
}

export type ImportStep = "target" | "upload" | "map" | "preview" | "result";

export interface WizardState {
  step: ImportStep;
  targetKey: string | null;
  file: File | null;
  detectedColumns: string[];
  detectedValues: Record<string, string[]>;
  fieldMapping: Record<string, string | null>;
  defaultValues: Record<string, unknown>;
  options: ImportOptions;
  selectedProfileId: number | null;
  previewResult: PreviewResult | null;
  commitResult: CommitResult | null;
  analyzeError: string | null;
  isAnalyzing: boolean;
  isPreviewing: boolean;
  isCommitting: boolean;
}
