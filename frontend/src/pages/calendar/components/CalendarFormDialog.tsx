import React from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { Label } from "@/components/ui/label";
import { ModalSection } from "@/components/ui/ModalSection";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LeaveRequest } from "@/types";

interface CarryOverData {
  carryOver?: { available_days?: number; effective_available_days?: number } | null;
  currentBalance?: { available_days?: number; effective_available_days?: number } | null;
}

interface CalendarFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  requestType: LeaveRequest["request_type"];
  onRequestTypeChange: (value: LeaveRequest["request_type"]) => void;
  selectedDates: { start: string; end: string } | null;
  onDateRangeChange: (start: string, end: string) => void;
  reason: string;
  onReasonChange: (value: string) => void;
  carryOverAndBalance: CarryOverData;
  isSubmitting: boolean;
  isError: boolean;
  error: Error | null;
  onSubmit: (e: React.FormEvent) => void;
}

const REQUEST_TYPE_OPTIONS: Array<{ value: LeaveRequest["request_type"]; label: string }> = [
  { value: "vacation", label: "Vacation" },
  { value: "sick", label: "Sick leave" },
];

export const CalendarFormDialog: React.FC<CalendarFormDialogProps> = ({
  open,
  onOpenChange,
  title,
  requestType,
  onRequestTypeChange,
  selectedDates,
  onDateRangeChange,
  reason,
  onReasonChange,
  carryOverAndBalance,
  isSubmitting,
  isError,
  error,
  onSubmit,
}) => {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Calendars group schedules; members share visibility settings."
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
    >
      <ModalSection title="Leave schedule" columns={2}>
        <div className="space-y-2">
          <Label className="text-xs font-medium">Request type</Label>
          <Select
            value={requestType}
            onValueChange={(value) => onRequestTypeChange(value as LeaveRequest["request_type"])}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {REQUEST_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="calendar-request-dates" className="text-xs font-medium">
            Event dates
          </Label>
          <DateRangePicker
            id="calendar-request-dates"
            from={selectedDates?.start ?? ""}
            to={selectedDates?.end ?? ""}
            onChange={({ from, to }) => onDateRangeChange(from, to)}
            placeholder="Select dates"
          />
        </div>
        {requestType === "vacation" ? (
          <p className="text-muted-foreground text-xs sm:col-span-2">
            Balance:{" "}
            {carryOverAndBalance.carryOver
              ? `${carryOverAndBalance.carryOver.effective_available_days ?? carryOverAndBalance.carryOver.available_days} carry-over + `
              : ""}
            {carryOverAndBalance.currentBalance
              ? `${carryOverAndBalance.currentBalance.effective_available_days ?? carryOverAndBalance.currentBalance.available_days} current`
              : "0 current"}
          </p>
        ) : null}
        <div className="space-y-2 sm:col-span-2">
          <Label className="text-xs font-medium">Reason / Notes</Label>
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="Optional reason..."
          />
        </div>
        {isError && (
          <div className="text-destructive text-xs sm:col-span-2">
            {error?.message || "Failed to create request"}
          </div>
        )}
      </ModalSection>
    </FormDialog>
  );
};
