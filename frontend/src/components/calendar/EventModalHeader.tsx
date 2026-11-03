import React from "react";
import { X } from "lucide-react";
import { toneSurfaceClass } from "@/components/ui/tone";
import type { CalendarEvent } from "./types";

// The data title is a pill abbreviation ("Vac: 3d"); the dialog spells the type out.
const TYPE_HEADING: Record<string, string> = {
  vacation: "Vacation",
  sick: "Sick leave",
  standby: "Standby",
};

interface EventModalHeaderProps {
  event: CalendarEvent;
  onClose: () => void;
}

export const EventModalHeader: React.FC<EventModalHeaderProps> = ({ event, onClose }) => {
  return (
    <div className="mb-4 flex items-start justify-between">
      <div>
        <h3 className="text-lg font-semibold">{TYPE_HEADING[event.type] ?? event.title}</h3>
        <p className="text-muted-foreground text-sm">{event.userName}</p>
      </div>
      <div className="flex items-center gap-2">
        <div
          className={`rounded-full px-2 py-1 text-xs font-medium ${
            event.status === "approved"
              ? toneSurfaceClass.success
              : event.status === "rejected"
                ? toneSurfaceClass.danger
                : toneSurfaceClass.warning
          }`}
        >
          {event.status}
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground flex h-11 w-11 items-center justify-center rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
      </div>
    </div>
  );
};
