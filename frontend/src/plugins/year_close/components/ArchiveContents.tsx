import React, { useMemo } from "react";
import { Download, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/GlassCard";
import { DataTable } from "@/components/ui/DataTable";
import { RowActions } from "@/components/ui/RowActions";
import type { AppColumnDef } from "@/components/ui/tableTypes";
import type { ArchiveCategory, ArchiveEntry, YearSnapshotFile } from "../types/yearClose";
import { formatBytes, formatDate } from "./archiveFormat";

interface ArchiveContentsProps {
  entry: ArchiveEntry;
  onDownload: (fileId: number) => void;
  onVerify: (fileId: number) => void;
  onRemove: (category: ArchiveCategory) => void;
}

/** What a closed year holds, how long each part is kept, and its downloadable files. */
export const ArchiveContents: React.FC<ArchiveContentsProps> = ({
  entry,
  onDownload,
  onVerify,
  onRemove,
}) => {
  const fileColumns = useMemo<AppColumnDef<YearSnapshotFile>[]>(
    () => [
      { id: "kind", accessorKey: "kind", header: "Covers", size: 110 },
      {
        id: "leader_name",
        accessorKey: "leader_name",
        header: "Manager",
        size: 140,
        cell: ({ row }) => row.original.leader_name || "-",
      },
      {
        id: "team_name",
        accessorKey: "team_name",
        header: "Team",
        size: 120,
        cell: ({ row }) => row.original.team_name || "-",
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
            {row.original.sha256 ? `${row.original.sha256.slice(0, 12)}…` : "-"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        size: 110,
        cell: ({ row }) => {
          const notReady = row.original.status !== "ready";
          const name = row.original.leader_name || row.original.kind;
          return (
            <RowActions
              actions={[
                {
                  label: `Download ${name} file`,
                  icon: Download,
                  onClick: () => onDownload(row.original.id),
                  disabled: notReady,
                  disabledReason: "This file is not ready.",
                },
                {
                  label: `Verify ${name} file`,
                  icon: ShieldCheck,
                  onClick: () => onVerify(row.original.id),
                  disabled: notReady,
                  disabledReason: "This file is not ready.",
                },
              ]}
            />
          );
        },
      },
    ],
    [onDownload, onVerify]
  );

  return (
    <>
      <GlassCard delay={0} className="p-4">
        <h3 className="text-sm font-medium">{entry.year} contents and retention</h3>
        <p className="text-muted-foreground mt-1 mb-3 text-xs">
          Counts come from the sealed manifest. Removal happens only after notice, from this area,
          by a superuser, once the files are verified.
        </p>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entry.categories.map((category) => (
            <li key={category.key} className="bg-muted/40 rounded-lg p-3">
              <p className="text-sm font-medium">{category.label}</p>
              <p className="text-lg font-semibold tabular-nums">{category.count ?? "-"}</p>
              <p className="text-muted-foreground text-xs">
                {category.location === "team" ? "In the team files" : "In the company file"} · kept
                until {formatDate(category.remove_on)}
              </p>
              {category.purged_at ? (
                <p className="text-muted-foreground mt-1 text-xs">
                  Removed on {formatDate(category.purged_at)}. The archive file is the record.
                </p>
              ) : (
                category.removable && (
                  <Button
                    variant="outline"
                    size="control-sm"
                    className="mt-2"
                    aria-label={`Remove ${category.label} of ${entry.year}`}
                    onClick={() => onRemove(category)}
                  >
                    <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
                    Remove...
                  </Button>
                )
              )}
            </li>
          ))}
        </ul>
      </GlassCard>
      <GlassCard delay={0} className="p-4">
        <h3 className="mb-3 text-sm font-medium">{entry.year} files</h3>
        <DataTable columns={fileColumns} data={entry.files} />
      </GlassCard>
    </>
  );
};
