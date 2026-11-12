export type YearSnapshotStatus = "blocked" | "building" | "ready" | "failed" | "superseded";

export interface YearSnapshotReadiness {
  blockers?: string[];
  warnings?: string[];
  error?: string;
}

export interface YearSnapshot {
  id: number;
  year: number;
  version: number;
  status: YearSnapshotStatus;
  readiness: YearSnapshotReadiness;
  started_at: string | null;
  completed_at: string | null;
  total_bytes: number;
  file_count: number;
  created_at: string;
}

export type YearSnapshotFileKind = "team" | "unassigned" | "company" | "manifest";

export interface YearSnapshotFile {
  id: number;
  kind: YearSnapshotFileKind;
  leader_name: string;
  team_name: string;
  sha256: string;
  size: number;
  status: "pending" | "ready" | "failed";
  error: string;
  created_at: string;
}

export interface ArchiveCategory {
  key: string;
  label: string;
  /** Null when the set was built before this category was recorded. */
  count: number | null;
  location: "company" | "team";
  retention_years: number;
  remove_on: string;
  /** The removal date has passed (the server still checks every other gate). */
  removable: boolean;
  purged_at: string | null;
  notice_sent_on: string | null;
}

export interface ArchiveEntry {
  year: number;
  snapshot_id: number;
  version: number;
  completed_at: string | null;
  total_bytes: number;
  categories: ArchiveCategory[];
  files: YearSnapshotFile[];
}

export type VerifyResult = "ok" | "mismatch" | "missing";

export interface LeaderHistoryRow {
  leader_id: number;
  username: string;
  name: string;
  is_current: boolean;
  scorecard_months: number;
  engagement_months: number;
  governance_evidence: number;
  leader_records: number;
}

export interface PurgeResult {
  year: number;
  category: string;
  dry_run: boolean;
  rows: Record<string, number>;
}
