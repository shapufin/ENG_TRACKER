import React from "react";
import { Button } from "@/components/ui/button";

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
}) => {
  if (selectedCount === 0) return null;

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-primary/50 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
          aria-label={`${selectedCount} users selected`}
        >
          {selectedCount}
        </div>
        <span className="text-sm font-medium">
          {selectedCount} user{selectedCount > 1 ? "s" : ""} selected
        </span>
      </div>
      <div className={`grid gap-2 ${onDelete ? "grid-cols-3" : "grid-cols-2"} sm:flex`}>
        <Button variant="outline" size="sm" onClick={onClear} className="w-full sm:w-auto">
          Clear selection
        </Button>
        <Button size="sm" onClick={onBulkActions} className="w-full sm:w-auto">
          Bulk edit
        </Button>
        {onDelete && (
          <Button variant="destructive" size="sm" onClick={onDelete} className="w-full sm:w-auto">
            Delete
          </Button>
        )}
      </div>
    </div>
  );
};
