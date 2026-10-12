import React from "react";
import { Pencil, Trash2 } from "lucide-react";
import { RowActions } from "@/components/ui/RowActions";

interface DataTableActionsProps<T> {
  item: T;
  /** Human name for the row, used in each button's accessible label. */
  itemLabel: string;
  onEdit: (item: T) => void;
  onDelete?: (item: T) => void;
}

export const DataTableActions = <T,>({
  item,
  itemLabel,
  onEdit,
  onDelete,
}: DataTableActionsProps<T>) => (
  <RowActions
    actions={[
      { label: `Edit ${itemLabel}`, shortLabel: "Edit", icon: Pencil, onClick: () => onEdit(item) },
      ...(onDelete
        ? [
            {
              label: `Delete ${itemLabel}`,
              shortLabel: "Delete",
              icon: Trash2,
              tone: "danger" as const,
              onClick: () => onDelete(item),
            },
          ]
        : []),
    ]}
  />
);
