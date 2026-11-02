import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toneFillClass } from "@/components/ui/tone";
import { Layers, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarWorkspace } from "@/types";

interface WorkspaceDropdownProps {
  workspaces: CalendarWorkspace[];
  selectedIds: number[];
  isMultiSelect: boolean;
  canMultiSelect: boolean;
  onChange: (id: number) => void;
  /** Replaces the whole selection in one update (All / Single). */
  onSelectionChange?: (ids: number[]) => void;
  onToggleMultiSelect?: () => void;
  className?: string;
}

const DOT_TONES = ["success", "accent", "warning", "danger", "info", "neutral"] as const;

export const WorkspaceDropdown: React.FC<WorkspaceDropdownProps> = ({
  workspaces,
  selectedIds,
  canMultiSelect,
  onChange,
  onSelectionChange,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const selectedWorkspace = workspaces.find((w) => selectedIds.includes(w.id));
  const activeCount = selectedIds.length;

  const handleSelectAll = () => onSelectionChange?.(workspaces.map((w) => w.id));

  const handleClearToSingle = () => {
    if (selectedIds.length > 1) onSelectionChange?.([selectedIds[0]]);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="control"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-label={`Select teams (${activeCount} selected)`}
          title={
            activeCount === 1 && selectedWorkspace
              ? `${selectedWorkspace.name} (1 team active)`
              : `Select teams (${activeCount} active)`
          }
          className={cn(
            "border-border/60 bg-background/60 hover:bg-muted/70 min-w-0 gap-1.5 rounded-xl px-2.5 text-xs font-semibold shadow-2xs backdrop-blur-sm sm:px-3",
            className
          )}
        >
          <Layers className="text-primary h-3.5 w-3.5 shrink-0" />
          <span className="max-w-30 truncate">
            {activeCount === 1 && selectedWorkspace ? selectedWorkspace.name : "Teams"}
          </span>
          <span className="font-mono text-xs">({activeCount})</span>
          <ChevronDown
            className={cn(
              "text-muted-foreground h-3.5 w-3.5 transition-transform duration-150",
              isOpen && "rotate-180"
            )}
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        role="dialog"
        aria-label="Select Active Teams"
        align="start"
        sideOffset={6}
        className="w-72 rounded-2xl p-2"
      >
        <div className="border-border/50 mb-1 flex items-center justify-between border-b px-2 py-1.5 pb-2">
          <span className="text-muted-foreground font-mono text-xs font-bold tracking-wider uppercase">
            Select Active Teams
          </span>
          {canMultiSelect && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-primary hover:text-primary/80 min-h-6 text-xs font-semibold transition"
              >
                All
              </button>
              <span aria-hidden="true" className="text-muted-foreground/40 text-xs">
                ·
              </span>
              <button
                type="button"
                onClick={handleClearToSingle}
                className="text-muted-foreground hover:text-foreground min-h-6 text-xs font-medium transition"
              >
                Single
              </button>
            </div>
          )}
        </div>

        <div className="no-scrollbar max-h-56 space-y-0.5 overflow-y-auto py-1">
          {workspaces.map((w, index) => {
            const isChecked = selectedIds.includes(w.id);
            const dotColor = toneFillClass[DOT_TONES[index % DOT_TONES.length]];
            return (
              <label
                key={w.id}
                className={cn(
                  "hover:bg-muted/60 flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition",
                  isChecked && "bg-muted/40 font-medium"
                )}
              >
                <div className="flex min-w-0 items-center gap-2.5 truncate">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onChange(w.id)}
                    className="border-border text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer rounded"
                  />
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", dotColor)} />
                  <span className="text-foreground truncate">{w.name}</span>
                </div>
                {isChecked && <Check className="text-primary h-3.5 w-3.5 shrink-0" />}
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};
