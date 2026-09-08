import React from "react";
import { X } from "lucide-react";
import type { CalendarEvent } from "./types";

interface EventModalHeaderProps {
  event: CalendarEvent;
  onClose: () => void;
}

export const EventModalHeader: React.FC<EventModalHeaderProps> = ({ event, onClose }) => {
  return (
    <div className="mb-4 flex items-start justify-between">
      <div>
        <h3 className="text-lg font-semibold">{event.title}</h3>
        <p className="text-sm text-muted-foreground">{event.userName}</p>
      </div>
      <div className="flex items-center gap-2">
        <div
          className={`rounded-full px-2 py-1 text-xs font-medium ${
            event.status === "approved"
              ? "bg-emerald-500/15 text-emerald-300"
              : event.status === "rejected"
                ? "bg-rose-500/15 text-rose-300"
                : "bg-amber-500/15 text-amber-300"
          }`}
        >
          {event.status}
        </div>
        <button
          onClick={onClose}
          className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
      </div>
    </div>
  );
};
