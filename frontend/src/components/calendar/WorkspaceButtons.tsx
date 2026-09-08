import React from "react";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarWorkspace } from "@/types";

interface WorkspaceButtonsProps {
  workspaces: CalendarWorkspace[];
  selectedIds: number[];
  onToggle: (id: number) => void;
  className?: string;
}

export const WorkspaceButtons: React.FC<WorkspaceButtonsProps> = ({
  workspaces,
  selectedIds,
  onToggle,
  className,
}) => (
  <div className={cn("flex flex-wrap gap-2", className)}>
    {workspaces.map((w) => (
      <Button
        key={w.id}
        variant={selectedIds.includes(w.id) ? "default" : "outline"}
        size="sm"
        onClick={() => onToggle(w.id)}
        className="gap-2"
      >
        {selectedIds.includes(w.id) && <Check className="h-3 w-3" />}
        {w.name}
      </Button>
    ))}
  </div>
);
