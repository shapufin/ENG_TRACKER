import React from "react";
import { format } from "date-fns";
import { CalendarDays, CalendarPlus, ShieldAlert, X } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toneSurfaceClass } from "@/components/ui/tone";
import { EventCard } from "./EventCard";
import type { CalendarEvent } from "./types";
import type { DayConflict } from "@/lib/calendarCoverage";

interface DayEventsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date | null;
  events: CalendarEvent[];
  /** Coverage warning for the day, when the roster drops to 50% or less. */
  conflict?: DayConflict;
  onEventActivate: (event: CalendarEvent) => void;
  onRequestTimeOff?: (date: Date) => void;
}

/**
 * Result of the cell's "+N more" affordance: the full list of entries for one
 * day. It is a read surface — activating an entry hands off to the existing
 * `EventActionModal` (edit/approve/delete) exactly as a grid card does.
 */
export const DayEventsDialog: React.FC<DayEventsDialogProps> = ({
  open,
  onOpenChange,
  date,
  events,
  conflict,
  onEventActivate,
  onRequestTimeOff,
}) => {
  const dayLabel = date ? format(date, "EEEE, MMMM d, yyyy") : "";
  const count = events.length;
  const conflictNames = conflict?.users.map((u) => u.name) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" hideClose padded={false}>
        <DialogTitle className="sr-only">{`Entries on ${dayLabel}`}</DialogTitle>
        <DialogDescription className="sr-only">
          Every vacation, sick leave and standby entry recorded for this day.
        </DialogDescription>

        <div className="flex min-h-0 flex-1 flex-col p-6">
          <DialogHeader className="shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="bg-tone-info-surface flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                  <CalendarDays className="text-tone-info-text h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-base">{dayLabel}</DialogTitle>
                  <DialogDescription>
                    {count} {count === 1 ? "entry" : "entries"}
                  </DialogDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="control-icon-sm"
                aria-label="Close day details"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>

          <DialogBody>
            {conflict && (
              <div
                className={cn(
                  "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
                  toneSurfaceClass.warning
                )}
              >
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0 space-y-0.5">
                  <p className="font-semibold">
                    {conflict.coveragePct}% coverage — {conflict.away} of {conflict.total} away
                  </p>
                  {conflictNames.length > 0 && (
                    <p className="text-muted-foreground">
                      {conflictNames.slice(0, 6).join(", ")}
                      {conflictNames.length > 6 ? ` +${conflictNames.length - 6} more` : ""}
                    </p>
                  )}
                </div>
              </div>
            )}

            {count === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                No entries recorded for this day.
              </p>
            ) : (
              <ul className="space-y-2">
                {events.map((event) => (
                  <li key={event.id}>
                    <EventCard event={event} onActivate={() => onEventActivate(event)} />
                  </li>
                ))}
              </ul>
            )}
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" size="control" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            {onRequestTimeOff && (
              <Button
                size="control"
                onClick={() => {
                  if (!date) return;
                  onOpenChange(false);
                  onRequestTimeOff(date);
                }}
                disabled={!date}
              >
                <CalendarPlus className="mr-2 h-4 w-4" />
                Request time off
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
