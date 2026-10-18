import React from "react";
import { SlidersHorizontal, Trash2 } from "lucide-react";
import { BulkActionBar } from "@/components/ui/BulkActionBar";

interface UsersPageBulkBarProps {
  selectedCount: number;
  onClear: () => void;
  onBulkActions: () => void;
  onDelete?: () => void;
}

export const UsersPageBulkBar: React.FC<UsersPageBulkBarProps> = ({
  selectedCount,
  onClear,
  onBulkActions,
  onDelete,
}) => (
  <BulkActionBar
    selectedCount={selectedCount}
    entityName="users"
    onClear={onClear}
    actions={[
      {
        label: "Bulk edit",
        icon: SlidersHorizontal,
        onClick: onBulkActions,
      },
      ...(onDelete
        ? [
            {
              label: "Delete",
              icon: Trash2,
              variant: "destructive" as const,
              onClick: onDelete,
            },
          ]
        : []),
    ]}
  />
);
