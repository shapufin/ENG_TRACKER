import React from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filter, SquareStack, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarWorkspace } from "@/types";

interface WorkspaceDropdownProps {
  workspaces: CalendarWorkspace[];
  selectedIds: number[];
  isMultiSelect: boolean;
  canMultiSelect: boolean;
  onChange: (id: number) => void;
  onToggleMultiSelect: () => void;
  className?: string;
}

export const WorkspaceDropdown: React.FC<WorkspaceDropdownProps> = ({
  workspaces,
  selectedIds,
  isMultiSelect,
  canMultiSelect,
  onChange,
  onToggleMultiSelect,
  className,
}) => {
  const selectedWorkspace = workspaces.find((w) => selectedIds.includes(w.id));

  return (
    <div className={cn("flex min-w-0 flex-nowrap items-center gap-2", className)}>
      <Select
        value={selectedIds.length === 1 ? selectedIds[0]?.toString() || "" : "multi"}
        onValueChange={(val) => {
          const id = parseInt(val);
          if (!isNaN(id)) onChange(id);
        }}
      >
        <SelectTrigger className="border-border/60 bg-background/50 min-w-0 flex-1 backdrop-blur-sm sm:w-[180px] sm:flex-none">
          <div className="flex items-center gap-2 truncate">
            <Filter className="text-muted-foreground h-4 w-4 shrink-0" />
            <SelectValue placeholder="Select workspace">
              {selectedIds.length > 1 ? (
                <span className="flex items-center gap-1.5">
                  <span className="bg-primary inline-flex h-2 w-2 rounded-full" />
                  <span>{selectedIds.length} Workspaces</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <span className="bg-primary inline-flex h-2 w-2 rounded-full" />
                  <span className="truncate">{selectedWorkspace?.name || "Select workspace"}</span>
                </span>
              )}
            </SelectValue>
          </div>
        </SelectTrigger>
        <SelectContent>
          {workspaces.map((w) => {
            const isSelected = selectedIds.includes(w.id);
            return (
              <SelectItem
                key={w.id}
                value={w.id.toString()}
                className={cn(
                  "cursor-pointer",
                  isSelected && "border-l-primary bg-primary/5 border-l-2 font-medium"
                )}
              >
                <div className="flex w-full items-center justify-between gap-3">
                  <span className={cn(isSelected && "text-foreground")}>{w.name}</span>
                  {isSelected && <Check className="text-primary h-4 w-4 font-bold" />}
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      {canMultiSelect && (
        <Button
          type="button"
          variant={isMultiSelect ? "default" : "outline"}
          size="control"
          className={cn("gap-1.5 text-xs font-semibold", isMultiSelect ? "shadow-sm" : "")}
          onClick={onToggleMultiSelect}
          title={
            isMultiSelect
              ? "Click to switch to single workspace selection"
              : "Click to enable multi-workspace selection"
          }
        >
          <SquareStack className="h-3.5 w-3.5" />
          {isMultiSelect ? "Multi" : "Single"}
        </Button>
      )}
    </div>
  );
};
