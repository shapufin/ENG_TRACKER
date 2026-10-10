import { useMemo } from "react";
import type { RowData } from "@tanstack/react-table";
import type { AppColumnDef } from "./tableTypes";
import { ColumnToggleMenu } from "./ColumnToggleMenu";

interface ColumnVisibilityMenuProps<TData extends RowData> {
  columns: AppColumnDef<TData, unknown>[];
  visibility: Record<string, boolean>;
  onVisibilityChange: (visibility: Record<string, boolean>) => void;
}

export function ColumnVisibilityMenu<TData extends RowData>({
  columns,
  visibility,
  onVisibilityChange,
}: ColumnVisibilityMenuProps<TData>) {
  const hideableColumns = useMemo(
    () =>
      columns.flatMap((col) => {
        const typedCol = col as { id?: string; accessorKey?: string; header?: unknown };
        const id = typedCol.id || typedCol.accessorKey;
        const header = col.header;
        const headerText =
          typeof header === "string" ? header : typedCol.accessorKey || typedCol.id;

        if (
          !id ||
          id === "select" ||
          header === undefined ||
          !headerText ||
          typeof headerText !== "string"
        )
          return [];
        return [{ id, label: headerText }];
      }),
    [columns]
  );

  return (
    <ColumnToggleMenu
      columns={hideableColumns}
      visibility={visibility}
      onVisibilityChange={onVisibilityChange}
    />
  );
}
