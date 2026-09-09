import React from "react";
import { Button } from "@/components/ui/button";
import { Trash2, Edit } from "lucide-react";
import { EventEditForm } from "./EventEditForm";
import { EventApprovalActions } from "./EventApprovalActions";
import type { CalendarEvent } from "./types";
import { useEventActionPermissions } from "./hooks/useEventActionPermissions";

interface EventActionButtonsProps {
  event: CalendarEvent;
  isEditing: boolean;
  isSubmitting: boolean;
  currentUser: { id: number } | null;
  canViewTeamData: boolean;
  onEditStart: () => void;
  onEditCancel: () => void;
  onSave: (data: { start: string; end: string; reason: string }) => Promise<void>;
  onApprove: () => Promise<void>;
  onReject: (reason: string) => Promise<void>;
  onRemove: () => void;
}

export const EventActionButtons: React.FC<EventActionButtonsProps> = ({
  event,
  isEditing,
  isSubmitting,
  currentUser,
  canViewTeamData,
  onEditStart,
  onEditCancel,
  onSave,
  onApprove,
  onReject,
  onRemove,
}) => {
  const { showEdit, showDelete, showApprovalActions, isHoliday } = useEventActionPermissions({
    event,
    currentUser,
    canViewTeamData,
  });

  if (isEditing) {
    return (
      <div className="mb-6 border-t border-border pt-4 dark:border-line-subtle">
        <EventEditForm
          event={event}
          onCancel={onEditCancel}
          onSave={onSave}
          isSubmitting={isSubmitting}
        />
      </div>
    );
  }

  if (showApprovalActions) {
    return (
      <div className="mb-6 border-t border-border pt-4 dark:border-line-subtle">
        <EventApprovalActions
          onApprove={onApprove}
          onReject={onReject}
          isSubmitting={isSubmitting}
          canApprove={true}
        />
      </div>
    );
  }

  if (showEdit || showDelete) {
    return (
      <div className="flex flex-wrap gap-2">
        {showEdit && (
          <Button
            size="sm"
            variant="outline"
            onClick={onEditStart}
            disabled={isSubmitting}
            className="flex items-center gap-1"
          >
            <Edit className="h-3 w-3" /> Edit
          </Button>
        )}
        {showDelete && (
          <Button
            size="sm"
            variant="outline"
            onClick={onRemove}
            disabled={isSubmitting}
            className="flex items-center gap-1 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/20"
          >
            <Trash2 className="h-3 w-3" /> {isSubmitting ? "Deleting..." : "Delete"}
          </Button>
        )}
      </div>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      {isHoliday ? "Holiday records are read-only." : "No actions available for this record."}
    </p>
  );
};
