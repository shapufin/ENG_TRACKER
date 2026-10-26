/** Previous Years: the frozen evidence set of each closed year (superuser only). */
import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FolderArchive } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge, type StatusVariant } from "@/components/ui/StatusBadge";
import { RowActions } from "@/components/ui/RowActions";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { navigateToDownload } from "@/lib/download";
import { handleApiError } from "@/lib/error-handler";
import { usePermissions } from "@/context/PermissionContext";
import type { AppColumnDef } from "@/components/ui/tableTypes";
import { yearCloseService } from "../services/yearCloseService";
import type { YearSnapshot, YearSnapshotFile } from "../types/yearClose";

const BYTE_UNITS = ["B", "KB", "MB", "GB"];

const formatBytes = (bytes: number): string => {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${BYTE_UNITS[unit]}`;
};

const formatDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";

const STATUS_VARIANT: Record<string, StatusVariant> = {
  ready: "approved",
  blocked: "cancelled",
  failed: "rejected",
  building: "pending",
  superseded: "cancelled",
};

export const PreviousYearsPage: React.FC = () => {
  const { isSuperuser } = usePermissions();
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  // SuperuserRoute also admits staff, so the page gates itself as well.
  if (!isSuperuser) {
    return (
      <PageShell title="Previous Years">
        <ErrorCard
          title="Access Denied"
          message="Only superusers can download a closed year."
        />
      </PageShell>
    );
  }

  return <PreviousYearsContent selectedYear={selectedYear} onSelectYear={setSelectedYear} />;
};

const PreviousYearsContent: React.FC<{
  selectedYear: number | null;
  onSelectYear: (year: number) => void;
}> = ({ selectedYear, onSelectYear }) => {
  const snapshots = useQuery({
    queryKey: ["year_close", "snapshots"],
    queryFn: yearCloseService.listSnapshots,
  });

  const files = useQuery({
    queryKey: ["year_close", "files", selectedYear],
    queryFn: () => {
      const snapshot = snapshots.data?.find((row) => row.year === selectedYear);
      return snapshot ? yearCloseService.listFiles(snapshot.id) : Promise.resolve([]);
    },
    enabled: selectedYear !== null && !!snapshots.data,
  });

  const download = async (fileId: number) => {
    try {
      navigateToDownload(await yearCloseService.getDownloadUrl(fileId));
    } catch (error) {
      handleApiError(error);
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
        cell: ({ row }) => <span className="tabular-nums">{formatBytes(row.original.total_bytes)}</span>,
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
                onClick: () => onSelectYear(row.original.year),
              },
            ]}
          />
        ),
      },
    ],
    [onSelectYear]
  );

  const fileColumns = useMemo<AppColumnDef<YearSnapshotFile>[]>(
    () => [
      { id: "kind", accessorKey: "kind", header: "Covers", size: 110 },
      {
        id: "leader_name",
        accessorKey: "leader_name",
        header: "IT TL",
        size: 140,
        cell: ({ row }) => row.original.leader_name || "—",
      },
      {
        id: "team_name",
        accessorKey: "team_name",
        header: "Team",
        size: 120,
        cell: ({ row }) => row.original.team_name || "—",
      },
      {
        id: "size",
        accessorKey: "size",
        header: "Size",
        size: 100,
        cell: ({ row }) => <span className="tabular-nums">{formatBytes(row.original.size)}</span>,
      },
      {
        id: "sha256",
        accessorKey: "sha256",
        header: "SHA-256",
        size: 140,
        cell: ({ row }) => (
          <span className="text-muted-foreground font-mono text-xs">
            {row.original.sha256 ? `${row.original.sha256.slice(0, 12)}…` : "—"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        size: 110,
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                label: `Download ${row.original.leader_name || row.original.kind} file`,
                icon: Download,
                onClick: () => download(row.original.id),
                disabled: row.original.status !== "ready",
                disabledReason: "This file is not ready.",
              },
            ]}
          />
        ),
      },
    ],
    []
  );

  if (snapshots.isLoading) return <LoadingCard rows={4} className="min-h-[300px]" />;
  if (snapshots.isError) {
    return (
      <PageShell title="Previous Years" subtitle="Frozen evidence for closed years">
        <ErrorCard onRetry={() => snapshots.refetch()} />
      </PageShell>
    );
  }

  const rows = snapshots.data ?? [];
  const selected = rows.find((row) => row.year === selectedYear) ?? null;
  const blockers = selected?.readiness?.blockers ?? [];
  const warnings = selected?.readiness?.warnings ?? [];

  return (
    <PageShell
      title="Previous Years"
      subtitle="Frozen evidence for closed years. Download a file; nothing here can be edited or deleted."
    >
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
            storageKey="table-visibility-previous-years"
            searchColumn="year"
            searchPlaceholder="Search years..."
          />
        </GlassCard>
      )}

      {selected && (
        <>
          {blockers.length > 0 && (
            <GlassCard delay={0} className="p-4">
              <h3 className="mb-2 text-sm font-medium">Why {selected.year} is blocked</h3>
              <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
                {blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </GlassCard>
          )}
          {warnings.length > 0 && (
            <GlassCard delay={0} className="p-4">
              <h3 className="mb-2 text-sm font-medium">Warnings</h3>
              <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </GlassCard>
          )}
          {selected.file_count > 0 && (
            <GlassCard delay={0} className="p-4">
              <h3 className="mb-3 text-sm font-medium">{selected.year} files</h3>
              {files.isError ? (
                <ErrorCard onRetry={() => files.refetch()} />
              ) : (
                <DataTable columns={fileColumns} data={files.data ?? []} />
              )}
            </GlassCard>
          )}
        </>
      )}
    </PageShell>
  );
};

export default PreviousYearsPage;
