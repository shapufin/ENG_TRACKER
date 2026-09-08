import React from "react";
import { Calendar, Clock, AlertCircle } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { CalendarEvent } from "./types";

interface EventInfoDisplayProps {
  event: CalendarEvent;
  isEditing: boolean;
}

export const EventInfoDisplay: React.FC<EventInfoDisplayProps> = ({ event, isEditing }) => {
  const startDate = format(parseISO(event.start), "PP");
  const endDate = format(parseISO(event.end), "PP");
  const dateDisplay = event.start === event.end ? startDate : `${startDate} → ${endDate}`;

  return (
    <div className="mb-6 space-y-2 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground dark:text-muted-foreground">
        <Calendar className="h-4 w-4" />
        <span>{dateDisplay}</span>
      </div>
      {typeof event.days === "number" && (
        <div className="flex items-center gap-2 text-muted-foreground dark:text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>{event.days} day(s)</span>
        </div>
      )}
      {typeof event.hours === "number" && (
        <div className="flex items-center gap-2 text-muted-foreground dark:text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>{event.hours}h</span>
        </div>
      )}
      {event.description && !isEditing && (
        <div className="flex items-start gap-2 text-muted-foreground dark:text-muted-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4" />
          <span className="text-xs">{event.description}</span>
        </div>
      )}
    </div>
  );
};
