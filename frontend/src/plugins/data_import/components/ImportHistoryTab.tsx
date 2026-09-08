import React, { useMemo } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { GlassCard } from "@/components/ui/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ImportBatch } from "../types/dataImport";

interface ImportHistoryTabProps {
  batches: ImportBatch[];
}

export const ImportHistoryTab: React.FC<ImportHistoryTabProps> = ({ batches }) => {
  const columns = useMemo(
    () => [
      { accessorKey: "created_at", header: "Date" },
      { accessorKey: "target_key", header: "Target" },
      { accessorKey: "original_filename", header: "File" },
      { accessorKey: "total_rows", header: "Rows" },
      { accessorKey: "created_count", header: "Created" },
      { accessorKey: "updated_count", header: "Updated" },
      { accessorKey: "skipped_count", header: "Skipped" },
      { accessorKey: "error_count", header: "Errors" },
    ],
    []
  );

  return (
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
  );
};
