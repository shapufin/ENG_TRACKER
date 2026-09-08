import React, { useMemo } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { GlassCard } from "@/components/ui/GlassCard";
import type { PreviewRow } from "../types/dataImport";

interface ImportPreviewTableProps {
  rows: PreviewRow[];
}

const EXCLUDED_PREVIEW_KEYS = ["__row_index"];

function formatPreviewValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString().split("T")[0];
  return String(value);
}

export const ImportPreviewTable: React.FC<ImportPreviewTableProps> = ({ rows }) => {
  const dataKeys = useMemo(() => {
    const keys = new Set<string>();
    rows.forEach((row) => {
      Object.keys(row.preview ?? {}).forEach((key) => {
        if (!EXCLUDED_PREVIEW_KEYS.includes(key)) {
          keys.add(key);
        }
      });
    });
    return Array.from(keys);
  }, [rows]);

  const columns = useMemo(
    () => [
      {
        accessorKey: "row_index",
        header: "Row",
      },
      ...dataKeys.map((key) => ({
        accessorKey: `preview.${key}`,
        header: key,
        cell: ({ row }: { row: { original: PreviewRow } }) => {
          const value = row.original.preview?.[key];
          return <span className="text-sm">{formatPreviewValue(value)}</span>;
        },
      })),
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }: { row: { original: PreviewRow } }) => {
          const status = row.original.status;
          const color =
            status === "valid" || status === "created"
              ? "text-success"
              : status === "updated"
                ? "text-primary"
                : status === "skipped"
                  ? "text-warning"
                  : "text-destructive";
          return <span className={`font-medium ${color}`}>{status}</span>;
        },
      },
      {
        accessorKey: "errors",
        header: "Errors",
        cell: ({ row }: { row: { original: PreviewRow } }) => {
          if (!row.original.errors.length) return null;
          return (
            <ul className="list-disc pl-4 text-xs text-destructive">
              {row.original.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          );
        },
      },
      {
        accessorKey: "warnings",
        header: "Warnings",
        cell: ({ row }: { row: { original: PreviewRow } }) => {
          if (!row.original.warnings.length) return null;
          return (
            <ul className="list-disc pl-4 text-xs text-warning">
              {row.original.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          );
        },
      },
    ],
    [dataKeys]
  );

  return (
    <GlassCard isHoverLift={false} className="p-4">
      <DataTable columns={columns} data={rows} pageSize={10} emptyMessage="No rows to preview." />
    </GlassCard>
  );
};
