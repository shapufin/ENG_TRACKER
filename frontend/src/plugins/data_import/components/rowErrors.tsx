import type { ColumnDef } from "@tanstack/react-table";

export interface RowError {
  row_index: number;
  errors: string[];
}

/** Shared by the commit-result card and the history error dialog. */
export const rowErrorColumns: ColumnDef<RowError>[] = [
  {
    accessorKey: "row_index",
    header: "Row",
  },
  {
    accessorKey: "errors",
    header: "Reason",
    cell: ({ row }) => (
      <ul className="list-disc pl-4 text-xs text-destructive">
        {row.original.errors.map((e, i) => (
          <li key={i}>{e}</li>
        ))}
      </ul>
    ),
  },
];
