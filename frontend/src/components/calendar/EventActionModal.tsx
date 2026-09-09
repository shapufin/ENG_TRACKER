import React, { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Trash2 } from "lucide-react";
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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const { isSubmitting, saveEdit, remove, approve, reject } = useEventActions(event, () =>
    onOpenChange(false)
  );

  if (!event) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="md" hideClose padded={false}>
          <DialogTitle className="sr-only">Record Actions</DialogTitle>
          <DialogDescription className="sr-only">
            Manage {event.type} record for {event.userName}
          </DialogDescription>

          <div className="flex min-h-0 flex-1 flex-col p-6">
            <div className="shrink-0">
              <EventModalHeader event={event} onClose={() => onOpenChange(false)} />
            </div>
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
              <EventInfoDisplay event={event} isEditing={isEditing} />
            </div>
            <div className="shrink-0 pt-4">
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
                onRemove={() => setDeleteConfirmOpen(true)}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Record"
        description="Are you sure you want to delete this record?"
        confirmLabel="Delete"
        variant="destructive"
        icon={<Trash2 className="h-4 w-4" />}
        onConfirm={() => {
          setDeleteConfirmOpen(false);
          void remove();
        }}
      />
    </>
  );
};
