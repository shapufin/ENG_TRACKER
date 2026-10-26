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
