import React, { useMemo, useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ImportBatch } from "../types/dataImport";
import { rowErrorColumns } from "./rowErrors";

interface ImportHistoryTabProps {
  batches: ImportBatch[];
}

export const ImportHistoryTab: React.FC<ImportHistoryTabProps> = ({ batches }) => {
  const [errorBatch, setErrorBatch] = useState<ImportBatch | null>(null);

  const columns = useMemo(
    () => [
      { accessorKey: "created_at", header: "Date" },
      { accessorKey: "target_key", header: "Target" },
      { accessorKey: "original_filename", header: "File" },
      { accessorKey: "total_rows", header: "Rows" },
      { accessorKey: "created_count", header: "Created" },
      { accessorKey: "updated_count", header: "Updated" },
      { accessorKey: "skipped_count", header: "Skipped" },
      {
        accessorKey: "error_count",
        header: "Errors",
        cell: ({ row }: { row: { original: ImportBatch } }) => {
          const batch = row.original;
          if (!batch.error_count) return <span>0</span>;
          return (
            <Button
              variant="outline"
              size="sm"
              className="h-11 sm:h-9"
              onClick={() => setErrorBatch(batch)}
              aria-label={`View ${batch.error_count} error(s) for ${batch.original_filename}`}
            >
              {batch.error_count} — view
            </Button>
          );
        },
      },
    ],
    []
  );

  return (
    <>
      <GlassCard isHoverLift={false}>
        <CardHeader>
          <CardTitle>Import History</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={batches}
            pageSize={10}
            emptyMessage="No imports have been committed yet."
          />
        </CardContent>
      </GlassCard>

      <Dialog open={errorBatch !== null} onOpenChange={(open) => !open && setErrorBatch(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Import errors</DialogTitle>
            <DialogDescription>
              {errorBatch?.original_filename} — {errorBatch?.error_count} row(s) failed.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <DataTable
              columns={rowErrorColumns}
              data={errorBatch?.row_errors ?? []}
              pageSize={10}
              emptyMessage="No row errors recorded."
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setErrorBatch(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
