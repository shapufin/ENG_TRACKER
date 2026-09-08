import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Clock, X } from "lucide-react";

interface EventEditFormProps {
  event: { start: string; end: string; description?: string };
  onCancel: () => void;
  onSave: (data: { start: string; end: string; reason: string }) => void;
  isSubmitting: boolean;
}

/**
 * Edit form for calendar events.
 * Handles date and reason editing for vacation/sick/standby events.
 *
 * Extracted from EventActionModal to reduce complexity.
 */
export const EventEditForm: React.FC<EventEditFormProps> = ({
  event,
  onCancel,
  onSave,
  isSubmitting,
}) => {
  const [editDates, setEditDates] = useState({ start: event.start, end: event.end });
  const [editReason, setEditReason] = useState(event.description || "");

  const handleSave = () => {
    onSave({ ...editDates, reason: editReason });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="start-date">Start Date</Label>
          <Input
            id="start-date"
            type="datetime-local"
            value={editDates.start}
            onChange={(e) => setEditDates({ ...editDates, start: e.target.value })}
            className="w-full"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="end-date">End Date</Label>
          <Input
            id="end-date"
            type="datetime-local"
            value={editDates.end}
            onChange={(e) => setEditDates({ ...editDates, end: e.target.value })}
            className="w-full"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="reason">Reason</Label>
        <Input
          id="reason"
          value={editReason}
          onChange={(e) => setEditReason(e.target.value)}
          placeholder="Enter reason..."
          className="w-full"
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          <X className="mr-2 h-4 w-4" />
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isSubmitting}>
          <Clock className="mr-2 h-4 w-4" />
          {isSubmitting ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
};
