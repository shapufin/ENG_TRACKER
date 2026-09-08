import React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import { useCalendarWorkspace } from "@/context/CalendarWorkspaceContext";
import { usePermissions } from "@/context/PermissionContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspaceData } from "./hooks/useWorkspaceData";
import { useWorkspaceInit } from "./hooks/useWorkspaceInit";
import { WorkspaceButtons } from "./WorkspaceButtons";
import { WorkspaceDropdown } from "./WorkspaceDropdown";

interface WorkspaceSelectorProps {
  className?: string;
  variant?: "dropdown" | "buttons";
}

export const WorkspaceSelector: React.FC<WorkspaceSelectorProps> = ({
  className,
  variant = "dropdown",
}) => {
  const { isTeamLeader, isAdmin, isHR } = usePermissions();
  const { user } = useAuth();
  const {
    selectedWorkspaceIds,
    setSelectedWorkspaces,
    toggleWorkspace,
    isMultiSelect,
    setIsMultiSelect,
  } = useCalendarWorkspace();
  const { data: workspaces = [], isLoading, refetch } = useWorkspaceData();

  const isPrivileged = isTeamLeader || isAdmin || isHR;
  const canMultiSelect = isPrivileged && workspaces.length > 1;
  const effectiveMultiSelect = isMultiSelect && canMultiSelect;

  useWorkspaceInit({
    isLoading,
    workspaces,
    selectedWorkspaceIds,
    setSelectedWorkspaces,
    userTeamId: user?.team?.id || user?.teams?.[0]?.id,
    isPrivileged,
    isMultiSelect,
  });

  const handleSelect = (id: number) => {
    if (effectiveMultiSelect) {
      if (selectedWorkspaceIds.includes(id)) {
        if (selectedWorkspaceIds.length > 1)
          setSelectedWorkspaces(selectedWorkspaceIds.filter((wid) => wid !== id));
      } else {
        setSelectedWorkspaces([...selectedWorkspaceIds, id]);
      }
    } else {
      setSelectedWorkspaces([id]);
    }
  };

  if (isLoading)
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className="h-9 w-32 animate-pulse rounded-md bg-muted/50" />
      </div>
    );

  if (workspaces.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col gap-3 rounded-lg border border-border/60 bg-card/60 p-4 text-sm text-muted-foreground",
          className
        )}
      >
        <p>No workspaces were found for your account.</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit gap-2"
          onClick={() => refetch()}
        >
          <RefreshCw className="h-4 w-4" /> Refresh list
        </Button>
      </div>
    );
  }

  if (variant === "buttons" && isPrivileged) {
    return (
      <WorkspaceButtons
        workspaces={workspaces}
        selectedIds={selectedWorkspaceIds}
        onToggle={toggleWorkspace}
        className={className}
      />
    );
  }

  return (
    <WorkspaceDropdown
      workspaces={workspaces}
      selectedIds={selectedWorkspaceIds}
      isMultiSelect={effectiveMultiSelect}
      canMultiSelect={canMultiSelect}
      onChange={handleSelect}
      onToggleMultiSelect={() => {
        if (isMultiSelect) setSelectedWorkspaces(selectedWorkspaceIds.slice(0, 1));
        setIsMultiSelect(!isMultiSelect);
      }}
      className={className}
    />
  );
};
