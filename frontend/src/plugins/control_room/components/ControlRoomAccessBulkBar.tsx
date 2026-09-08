import React from "react";
import { Button } from "@/components/ui/button";

interface ControlRoomAccessBulkBarProps {
  selectedCount: number;
  onClear: () => void;
  onOpen: () => void;
}

export const ControlRoomAccessBulkBar: React.FC<ControlRoomAccessBulkBarProps> = ({
  selectedCount,
  onClear,
  onOpen,
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
          aria-label={`${selectedCount} access records selected`}
        >
          {selectedCount}
        </div>
        <span className="text-sm font-medium">
          {selectedCount} access record{selectedCount === 1 ? "" : "s"} selected
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <Button variant="outline" size="sm" onClick={onClear} className="w-full sm:w-auto">
          Clear selection
        </Button>
        <Button size="sm" onClick={onOpen} className="w-full sm:w-auto">
          Bulk update
        </Button>
      </div>
    </div>
  );
};
