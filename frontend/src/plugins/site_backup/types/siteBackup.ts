export interface BackupRecord {
  id: number;
  filename: string;
  size_bytes: number;
  checksum: string;
  migration_state_hash: string;
  db_row_count: number;
  media_file_count: number;
  note: string;
  created_by_username: string | null;
  created_at: string;
}

export interface RestoreModelGroup {
  model: string;
  file_count: number;
  db_count: number;
  new: number;
  overwritten: number;
  db_only: number;
  forced_dependents: string[];
}

export interface RestoreMediaPreview {
  new: number;
  overwritten: number;
  total: number;
}

export interface RestorePreviewResult {
  manifest: {
    schema_version: number;
    created_at: string;
    django_version: string;
    migration_state_hash: string;
    includes_media: boolean;
    model_row_counts: Record<string, number>;
    media_file_count: number;
  };
  schema_compatible: boolean;
  model_groups: RestoreModelGroup[];
  media: RestoreMediaPreview;
}

export interface RestoreCommitResult {
  created: Record<string, number>;
  updated: Record<string, number>;
  deleted: Record<string, number>;
  media_extracted: number;
}

/** Either an uploaded archive or a previously stored backup's id. */
export type ArchiveSource = { file: File } | { backupId: number };
