import React, { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { CalendarEvent } from "./types";
import { useEventActions } from "./useEventActions";
import { EventModalHeader } from "./EventModalHeader";
import { EventInfoDisplay } from "./EventInfoDisplay";
import { EventActionButtons } from "./EventActionButtons";

interface EventActionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: CalendarEvent | null;
  currentUser: { id: number } | null;
  canViewTeamData: boolean;
}

export const EventActionModal: React.FC<EventActionModalProps> = ({
  open,
  onOpenChange,
  event,
  currentUser,
  canViewTeamData,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const { isSubmitting, saveEdit, remove, approve, reject } = useEventActions(event, () =>
    onOpenChange(false)
  );

  if (!event) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border border-border bg-popover p-0 text-popover-foreground [&>button]:hidden">
        <DialogTitle className="sr-only">Record Actions</DialogTitle>
        <DialogDescription className="sr-only">
          Manage {event.type} record for {event.userName}
        </DialogDescription>

        <div className="p-6">
          <EventModalHeader event={event} onClose={() => onOpenChange(false)} />
          <EventInfoDisplay event={event} isEditing={isEditing} />
          <EventActionButtons
            event={event}
            isEditing={isEditing}
            isSubmitting={isSubmitting}
            currentUser={currentUser}
            canViewTeamData={canViewTeamData}
            onEditStart={() => setIsEditing(true)}
            onEditCancel={() => setIsEditing(false)}
            onSave={saveEdit}
            onApprove={approve}
            onReject={reject}
            onRemove={remove}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
