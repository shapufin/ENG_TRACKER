import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Trash2, ShieldAlert, DatabaseBackup } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { LoadingStateWrapper } from "@/components/ui/LoadingStateWrapper";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/context/PermissionContext";
import { handleApiError } from "@/lib/error-handler";

import { siteBackupService } from "../services/siteBackupService";
import { RestorePreviewTable } from "../components/RestorePreviewTable";
import type { ArchiveSource, BackupRecord, RestoreCommitResult } from "../types/siteBackup";

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
};

const BackupsTab: React.FC = () => {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [includeMedia, setIncludeMedia] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<BackupRecord | null>(null);

  const {
    data: backups,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["site_backup", "backups"],
    queryFn: () => siteBackupService.listBackups(),
  });

  const createMutation = useMutation({
    mutationFn: () => siteBackupService.createBackup(note, includeMedia),
    onSuccess: () => {
      toast.success("Backup created");
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["site_backup", "backups"] });
    },
    onError: (err) => handleApiError(err),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => siteBackupService.deleteBackup(id),
    onSuccess: () => {
      toast.success("Backup deleted");
      setPendingDelete(null);
      queryClient.invalidateQueries({ queryKey: ["site_backup", "backups"] });
    },
    onError: (err) => handleApiError(err),
  });

  return (
    <div className="space-y-6">
      <GlassCard className="space-y-4 p-4">
        <h2 className="text-sm font-semibold">Create a new backup</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label htmlFor="backup-note" className="mb-1 block text-xs text-muted-foreground">
              Note (optional)
            </label>
            <Input
              id="backup-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. pre-release snapshot"
            />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <Checkbox
              checked={includeMedia}
              onCheckedChange={(checked) => setIncludeMedia(checked === true)}
              aria-label="Include media files"
            />
            Include media files
          </label>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="mb-0.5"
          >
            <DatabaseBackup className="mr-2 h-4 w-4" />
            {createMutation.isPending ? "Creating..." : "Create backup"}
          </Button>
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <LoadingStateWrapper isLoading={isLoading}>
          {error ? (
            <ErrorCard title="Failed to load backups" message={(error as Error).message} />
          ) : !backups || backups.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No backups yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-line-subtle text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4">Filename</th>
                    <th className="py-2 pr-4">Created</th>
                    <th className="py-2 pr-4 text-right">Size</th>
                    <th className="py-2 pr-4 text-right">Rows</th>
                    <th className="py-2 pr-4 text-right">Media</th>
                    <th className="py-2 pr-4">Note</th>
                    <th className="py-2 pr-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((record) => (
                    <tr key={record.id} className="border-b border-line-subtle last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">{record.filename}</td>
                      <td className="py-2 pr-4">{new Date(record.created_at).toLocaleString()}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatBytes(record.size_bytes)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{record.db_row_count}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {record.media_file_count}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">{record.note || "—"}</td>
                      <td className="py-2 pr-2">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Download ${record.filename}`}
                            onClick={() => siteBackupService.downloadBackup(record)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${record.filename}`}
                            onClick={() => setPendingDelete(record)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </LoadingStateWrapper>
      </GlassCard>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this backup?"
        description={
          pendingDelete
            ? `"${pendingDelete.filename}" will be permanently removed. This cannot be undone.`
            : undefined
        }
        variant="destructive"
        confirmLabel="Delete"
        isConfirming={deleteMutation.isPending}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
      />
    </div>
  );
};

const RestoreTab: React.FC = () => {
  const { data: backups } = useQuery({
    queryKey: ["site_backup", "backups"],
    queryFn: () => siteBackupService.listBackups(),
  });

  const [file, setFile] = useState<File | null>(null);
  const [selectedBackupId, setSelectedBackupId] = useState<number | "">("");
  const [approvedModels, setApprovedModels] = useState<Set<string>>(new Set());
  const [deleteMissingModels, setDeleteMissingModels] = useState<Set<string>>(new Set());
  const [restoreMedia, setRestoreMedia] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [commitResult, setCommitResult] = useState<RestoreCommitResult | null>(null);

  const source: ArchiveSource | null = file
    ? { file }
    : selectedBackupId
      ? { backupId: selectedBackupId }
      : null;

  const previewMutation = useMutation({
    mutationFn: () => {
      if (!source) throw new Error("Choose a file or a stored backup first.");
      return siteBackupService.previewRestore(source);
    },
    onSuccess: () => {
      setApprovedModels(new Set());
      setDeleteMissingModels(new Set());
      setCommitResult(null);
    },
    onError: (err) => handleApiError(err),
  });

  const commitMutation = useMutation({
    mutationFn: () => {
      if (!source) throw new Error("Choose a file or a stored backup first.");
      return siteBackupService.commitRestore(source, {
        approvedModels: Array.from(approvedModels),
        deleteMissingModels: Array.from(deleteMissingModels),
        restoreMedia,
        confirmed: true,
      });
    },
    onSuccess: (result) => {
      toast.success("Restore complete");
      setCommitResult(result);
      setConfirmOpen(false);
    },
    onError: (err) => {
      handleApiError(err);
      setConfirmOpen(false);
    },
  });

  const preview = previewMutation.data;

  const toggleApprove = (model: string) => {
    setApprovedModels((prev) => {
      const next = new Set(prev);
      if (next.has(model)) {
        next.delete(model);
        setDeleteMissingModels((dm) => {
          const nextDm = new Set(dm);
          nextDm.delete(model);
          return nextDm;
        });
      } else {
        next.add(model);
      }
      return next;
    });
  };

  const toggleDeleteMissing = (model: string) => {
    setDeleteMissingModels((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
  };

  const canRestore = approvedModels.size > 0 && understood;

  return (
    <div className="space-y-6">
      <GlassCard className="space-y-4 p-4">
        <h2 className="text-sm font-semibold">Choose a source</h2>
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label htmlFor="restore-file" className="mb-1 block text-xs text-muted-foreground">
              Upload an archive
            </label>
            <input
              id="restore-file"
              type="file"
              accept=".zip"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setSelectedBackupId("");
                setCommitResult(null);
              }}
              className="block text-sm"
            />
          </div>
          <span className="text-xs text-muted-foreground">or</span>
          <div>
            <label htmlFor="restore-backup" className="mb-1 block text-xs text-muted-foreground">
              Pick a stored backup
            </label>
            <select
              id="restore-backup"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={selectedBackupId}
              onChange={(e) => {
                setSelectedBackupId(e.target.value ? Number(e.target.value) : "");
                setFile(null);
                setCommitResult(null);
              }}
            >
              <option value="">Select…</option>
              {(backups ?? []).map((record) => (
                <option key={record.id} value={record.id}>
                  {record.filename}
                </option>
              ))}
            </select>
          </div>
          <Button
            onClick={() => previewMutation.mutate()}
            disabled={!source || previewMutation.isPending}
          >
            {previewMutation.isPending ? "Analyzing..." : "Preview restore"}
          </Button>
        </div>
      </GlassCard>

      {preview && !preview.schema_compatible && (
        <GlassCard glow="destructive" className="flex items-start gap-3 p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-tone-danger-text" />
          <div>
            <p className="font-semibold text-tone-danger-text">Restore blocked</p>
            <p className="text-sm text-muted-foreground">
              This backup was taken from a different database schema and cannot be safely restored
              here. Take a fresh backup on this environment, or restore onto an environment with a
              matching schema.
            </p>
          </div>
        </GlassCard>
      )}

      {preview && preview.schema_compatible && (
        <GlassCard className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Approve what to restore</h2>
            {preview.media.total > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={restoreMedia}
                  onCheckedChange={(checked) => setRestoreMedia(checked === true)}
                  aria-label="Restore media files"
                />
                Restore media ({preview.media.new} new, {preview.media.overwritten} overwritten)
              </label>
            )}
          </div>

          <RestorePreviewTable
            modelGroups={preview.model_groups}
            approvedModels={approvedModels}
            onToggleApprove={toggleApprove}
            deleteMissingModels={deleteMissingModels}
            onToggleDeleteMissing={toggleDeleteMissing}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle pt-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={understood}
                onCheckedChange={(checked) => setUnderstood(checked === true)}
                aria-label="I understand this replaces data"
              />
              I understand this replaces existing data and cannot be undone.
            </label>
            <Button
              variant="destructive"
              disabled={!canRestore}
              onClick={() => setConfirmOpen(true)}
            >
              Restore approved data
            </Button>
          </div>
        </GlassCard>
      )}

      {commitResult && (
        <GlassCard glow="success" className="space-y-2 p-4">
          <h2 className="text-sm font-semibold">Restore result</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            {Object.entries(commitResult.created)
              .filter(([, count]) => count > 0)
              .map(([model, count]) => (
                <Badge key={`c-${model}`} variant="success">
                  {model}: +{count} created
                </Badge>
              ))}
            {Object.entries(commitResult.updated)
              .filter(([, count]) => count > 0)
              .map(([model, count]) => (
                <Badge key={`u-${model}`} variant="info">
                  {model}: {count} updated
                </Badge>
              ))}
            {Object.entries(commitResult.deleted)
              .filter(([, count]) => count > 0)
              .map(([model, count]) => (
                <Badge key={`d-${model}`} variant="warning">
                  {model}: {count} deleted
                </Badge>
              ))}
          </div>
          {commitResult.media_extracted > 0 && (
            <p className="text-sm text-muted-foreground">
              {commitResult.media_extracted} media file(s) extracted.
            </p>
          )}
        </GlassCard>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Restore approved data?"
        description={`${approvedModels.size} model group(s) will be restored${
          deleteMissingModels.size > 0
            ? `, and rows missing from the backup will be deleted for ${deleteMissingModels.size} of them`
            : ""
        }. This cannot be undone.`}
        variant="destructive"
        confirmLabel="Restore"
        isConfirming={commitMutation.isPending}
        onConfirm={() => commitMutation.mutate()}
      />
    </div>
  );
};

export const BackupRestorePage: React.FC = () => {
  const { isSuperuser } = usePermissions();
  const [tab, setTab] = useState("backups");

  const tabs = useMemo(
    () => [
      { value: "backups", label: "Backups" },
      { value: "restore", label: "Restore" },
    ],
    []
  );

  if (!isSuperuser) {
    return (
      <PageShell title="Backup & Restore">
        <ErrorCard
          title="Access Denied"
          message="Only superusers can access site backup & restore."
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Backup & Restore"
      subtitle="Manual full-site backups and a selective, preview-first restore."
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="backups" className="space-y-6">
          <BackupsTab />
        </TabsContent>
        <TabsContent value="restore" className="space-y-6">
          <RestoreTab />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
};
