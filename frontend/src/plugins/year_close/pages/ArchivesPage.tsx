/** Archives: the frozen evidence of each closed year and the leader history (superuser only). */
import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderArchive } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge, type StatusVariant } from "@/components/ui/StatusBadge";
import { RowActions } from "@/components/ui/RowActions";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { navigateToDownload } from "@/lib/download";
import { handleApiError } from "@/lib/error-handler";
import { usePermissions } from "@/context/PermissionContext";
import type { AppColumnDef } from "@/components/ui/tableTypes";
import { ArchiveContents } from "../components/ArchiveContents";
import { LeaderHistoryTab } from "../components/LeaderHistoryTab";
import { PurgeDialog } from "../components/PurgeDialog";
import { formatBytes, formatDate } from "../components/archiveFormat";
import { yearCloseService } from "../services/yearCloseService";
import type { ArchiveCategory, VerifyResult, YearSnapshot } from "../types/yearClose";

const STATUS_VARIANT: Record<string, StatusVariant> = {
  ready: "approved",
  blocked: "cancelled",
  failed: "rejected",
  building: "pending",
  superseded: "cancelled",
};

type ArchivesTab = "years" | "leaders";

const showVerifyResult = (result: VerifyResult) => {
  if (result === "ok") toast.success("The file matches its sealed checksum.");
  else if (result === "mismatch") toast.error("The file does not match its checksum. Do not rely on it.");
  else toast.error("The file is missing from the archive volume.");
};

export const ArchivesPage: React.FC = () => {
  const { isSuperuser } = usePermissions();

  // SuperuserRoute also admits staff, so the page gates itself as well.
  if (!isSuperuser) {
    return (
      <PageShell title="Archives">
        <ErrorCard title="Access Denied" message="Only superusers can open the archives." />
      </PageShell>
    );
  }

  return <ArchivesContent />;
};

const ArchivesContent: React.FC = () => {
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [tab, setTab] = useState<ArchivesTab>("years");
  const [removing, setRemoving] = useState<ArchiveCategory | null>(null);
  const [confirmingSet, setConfirmingSet] = useState(false);
  const [isConfirmingSet, setIsConfirmingSet] = useState(false);
  const queryClient = useQueryClient();

  const snapshots = useQuery({
    queryKey: ["year_close", "snapshots"],
    queryFn: yearCloseService.listSnapshots,
  });
  const archives = useQuery({
    queryKey: ["year_close", "archives"],
    queryFn: yearCloseService.listArchives,
  });

  const download = async (fileId: number) => {
    try {
      navigateToDownload(await yearCloseService.getDownloadUrl(fileId));
    } catch (error) {
      handleApiError(error);
    }
  };

  const verify = async (fileId: number) => {
    try {
      showVerifyResult(await yearCloseService.verifyFile(fileId));
    } catch (error) {
      handleApiError(error);
    }
  };

  const confirmSet = async (year: number) => {
    setIsConfirmingSet(true);
    try {
      await yearCloseService.confirmSet(year);
      toast.success(`The rebuilt ${year} archive is confirmed.`);
      setConfirmingSet(false);
      void queryClient.invalidateQueries({ queryKey: ["year_close"] });
    } catch (error) {
      handleApiError(error);
    } finally {
      setIsConfirmingSet(false);
    }
  };

  const snapshotColumns = useMemo<AppColumnDef<YearSnapshot>[]>(
    () => [
      { id: "year", accessorKey: "year", header: "Year", size: 90 },
      {
        id: "status",
        accessorKey: "status",
        header: "Status",
        size: 130,
        cell: ({ row }) => (
          <StatusBadge
            variant={STATUS_VARIANT[row.original.status] ?? "pending"}
            label={row.original.status}
            isCompact
            isShowIcon={false}
          />
        ),
      },
      {
        id: "file_count",
        accessorKey: "file_count",
        header: "Files",
        size: 80,
        cell: ({ row }) => <span className="tabular-nums">{row.original.file_count}</span>,
      },
      {
        id: "total_bytes",
        accessorKey: "total_bytes",
        header: "Size",
        size: 100,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatBytes(row.original.total_bytes)}</span>
        ),
      },
      {
        id: "completed_at",
        accessorKey: "completed_at",
        header: "Built",
        size: 130,
        cell: ({ row }) => formatDate(row.original.completed_at),
      },
      {
        id: "actions",
        header: "Actions",
        size: 120,
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                label: `Files for ${row.original.year}`,
                icon: FolderArchive,
                onClick: () => setSelectedYear(row.original.year),
              },
            ]}
          />
        ),
      },
    ],
    []
  );

  if (snapshots.isLoading || archives.isLoading) {
    return <LoadingCard rows={4} className="min-h-[300px]" />;
  }
  if (snapshots.isError || archives.isError) {
    return (
      <PageShell title="Archives" subtitle="Frozen evidence for closed years">
        <ErrorCard
          onRetry={() => {
            void snapshots.refetch();
            void archives.refetch();
          }}
        />
      </PageShell>
    );
  }

  const rows = snapshots.data ?? [];
  const entries = archives.data ?? [];
  const selected = rows.find((row) => row.year === selectedYear) ?? null;
  const entry = entries.find((row) => row.year === selectedYear) ?? null;
  const blockers = selected?.readiness?.blockers ?? [];
  const warnings = selected?.readiness?.warnings ?? [];

  return (
    <PageShell
      title="Archives"
      subtitle="Frozen evidence for closed years. Download or verify a file; nothing here can be edited."
    >
      <Tabs value={tab} onValueChange={(value) => setTab(value as ArchivesTab)}>
        <TabsList>
          <TabsTrigger value="years">Years</TabsTrigger>
          <TabsTrigger value="leaders">Leader history</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "leaders" ? (
        <LeaderHistoryTab years={entries.map((row) => row.year)} />
      ) : (
        <>
          {rows.length === 0 ? (
            <EmptyState
              icon={FolderArchive}
              title="No closed years yet"
              description="A year closes by itself once it is ready, from 1 February of the following year."
            />
          ) : (
            <GlassCard delay={0} className="p-4">
              <DataTable
                columns={snapshotColumns}
                data={rows}
                storageKey="table-visibility-archives"
                searchColumn="year"
                searchPlaceholder="Search years..."
              />
            </GlassCard>
          )}

          {selected && blockers.length > 0 && (
            <GlassCard delay={0} className="p-4">
              <h3 className="mb-2 text-sm font-medium">Why {selected.year} is blocked</h3>
              <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
                {blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </GlassCard>
          )}
          {selected && warnings.length > 0 && (
            <GlassCard delay={0} className="p-4">
              <h3 className="mb-2 text-sm font-medium">Warnings</h3>
              <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </GlassCard>
          )}
          {entry?.needs_confirmation && (
            <GlassCard delay={0} className="p-4">
              <h3 className="mb-1 text-sm font-medium">Confirm the rebuilt {entry.year} archive</h3>
              <p className="text-muted-foreground mb-3 text-sm">
                This archive (version {entry.version}) was rebuilt after the year was reopened.
                Download and check it, then confirm it. Nothing of {entry.year} can be removed
                until it is confirmed.
              </p>
              <Button variant="outline" size="control-sm" onClick={() => setConfirmingSet(true)}>
                Confirm rebuilt archive
              </Button>
            </GlassCard>
          )}
          {entry && (
            <ConfirmDialog
              open={confirmingSet}
              onOpenChange={setConfirmingSet}
              title={`Confirm the ${entry.year} archive (version ${entry.version})?`}
              description="Confirm only after you checked the downloaded files. The server verifies every checksum again and records who confirmed."
              confirmLabel="Confirm archive"
              isConfirming={isConfirmingSet}
              onConfirm={() => void confirmSet(entry.year)}
            />
          )}
          {entry && (
            <ArchiveContents
              entry={entry}
              onDownload={download}
              onVerify={verify}
              onRemove={setRemoving}
            />
          )}
          {entry && (
            <PurgeDialog
              year={entry.year}
              category={removing}
              onClose={() => setRemoving(null)}
              onDone={() => void queryClient.invalidateQueries({ queryKey: ["year_close"] })}
            />
          )}
        </>
      )}
    </PageShell>
  );
};
