import React from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusVariant } from "@/components/ui/StatusBadge";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import {
  formatSegmentRange,
  formatStandbyHours,
  type DayGroupedStandbyLog,
  type StandbyDaySegment,
} from "@/lib/standbyDayGroups";

interface StandbySegmentPickerProps {
  /** The bundled day being edited; null keeps the dialog closed. */
  day: DayGroupedStandbyLog | null;
  onPick: (segment: StandbyDaySegment) => void;
  onClose: () => void;
}

/** A bundled day is several records, so editing asks which one. */
export const StandbySegmentPicker: React.FC<StandbySegmentPickerProps> = ({
  day,
  onPick,
  onClose,
}) => (
  <Dialog open={day !== null} onOpenChange={(open) => !open && onClose()}>
    <DialogContent size="sm">
      <DialogHeader>
        <DialogTitle>Edit which shift?</DialogTitle>
        <DialogDescription>
          {day ? formatDateDDMMYYYY(day.date) : ""} has {day?.segments?.length ?? 0} shifts. Each is
          its own record.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className="flex flex-col gap-2">
          {day?.segments?.map((segment) => (
            <Button
              key={segment.id}
              variant="outline"
              className="justify-between"
              onClick={() => onPick(segment)}
            >
              <span className="font-mono">
                {formatSegmentRange(segment) ?? "No times"} ({formatStandbyHours(segment.hours)}h)
              </span>
              <StatusBadge variant={segment.status as StatusVariant} />
            </Button>
          ))}
        </div>
      </DialogBody>
    </DialogContent>
  </Dialog>
);
