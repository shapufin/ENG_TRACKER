/**
 * TimeHoursGrid — 3-column grid with Start Time, End Time, and
 * auto-calculated Hours inputs.
 *
 * Extracted from OvertimeFormDialog and StandbyFormDialog which shared
 * 35 lines of identical JSX for this grid. The parent form owns the
 * state and passes values + change handlers as props.
 */
import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  startTime: string;
  endTime: string;
  hours: string;
  previewHours: number | null;
  startTimeError?: string;
  endTimeError?: string;
  onStartTimeChange: (v: string) => void;
  onEndTimeChange: (v: string) => void;
}

export const TimeHoursGrid: React.FC<Props> = ({
  startTime,
  endTime,
  hours,
  previewHours,
  startTimeError,
  endTimeError,
  onStartTimeChange,
  onEndTimeChange,
}) => (
  <div className="grid grid-cols-3 gap-4">
    <div className="space-y-2">
      <Label>Start Time *</Label>
      <Input
        type="time"
        value={startTime}
        onChange={(e) => onStartTimeChange(e.target.value)}
        className={startTimeError ? "border-destructive" : ""}
        required
      />
      {startTimeError && <p className="text-xs text-destructive">{startTimeError}</p>}
    </div>
    <div className="space-y-2">
      <Label>End Time *</Label>
      <Input
        type="time"
        value={endTime}
        onChange={(e) => onEndTimeChange(e.target.value)}
        className={endTimeError ? "border-destructive" : ""}
        required
      />
      {endTimeError && <p className="text-xs text-destructive">{endTimeError}</p>}
    </div>
    <div className="space-y-2">
      <Label>Hours (auto-calculated)</Label>
      <Input
        type="text"
        value={previewHours !== null ? `${previewHours}h` : hours ? `${hours}h` : "-"}
        disabled
        className="bg-muted"
      />
    </div>
  </div>
);
