/**
 * DateRangePicker — single unified control for picking a date range.
 * Replaces pairs of separate DatePicker/native date inputs across the app.
 * Displays DD/MM/YYYY, offers Quick Ranges presets and a dual-month
 * Custom Range calendar with explicit Save/Cancel (draft state).
 */
import React, { useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";
import { controlSurface, type ControlSize } from "./controlSurface";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import { DEFAULT_QUICK_RANGES, type QuickRangePreset } from "@/lib/quickDateRanges";
import { DateRangePickerPopoverContent } from "./DateRangePickerPopoverContent";

export interface DateRange {
  from: string;
  to: string;
}

interface DateRangePickerProps {
  from: string;
  to: string;
  onChange: (range: DateRange) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  presets?: QuickRangePreset[];
  /** Accessible name for the trigger button. Defaults to "Open date range picker". */
  ariaLabel?: string;
  /** Height token, same scale as Input/SelectTrigger so a toolbar aligns. */
  controlSize?: ControlSize;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  from,
  to,
  onChange,
  placeholder = "Select date range",
  disabled = false,
  className,
  id,
  presets = DEFAULT_QUICK_RANGES,
  ariaLabel = "Open date range picker",
  controlSize,
}) => {
  const [open, setOpen] = useState(false);

  const label =
    from && to
      ? `${formatDateDDMMYYYY(from)} - ${formatDateDDMMYYYY(to)}`
      : from
        ? formatDateDDMMYYYY(from)
        : "";

  const handleCommit = (range: DateRange) => {
    onChange(range);
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            "flex items-center justify-between gap-2",
            controlSurface({ controlSize }),
            className
          )}
        >
          <span className={cn("truncate text-left", !label && "text-muted-foreground")}>
            {label || placeholder}
          </span>
          <CalendarIcon className="text-muted-foreground h-4 w-4 shrink-0" />
        </button>
      </Popover.Trigger>

      {open && (
        <DateRangePickerPopoverContent
          from={from}
          to={to}
          presets={presets}
          onCommit={handleCommit}
          onClose={() => setOpen(false)}
        />
      )}
    </Popover.Root>
  );
};
