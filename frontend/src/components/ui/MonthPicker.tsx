import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { generateMonthOptions, formatMonthLabel } from "@/lib/monthOptions";

interface MonthPickerProps {
  /** Currently selected month in "YYYY-MM-DD" (first of month) or "YYYY-MM" format. */
  value: string;
  /** Called with the selected month string (same format as `value`). */
  onMonthChange: (month: string) => void;
  /** Number of months to show, ending at the current month. Default 12. */
  monthCount?: number;
  /** Optional placeholder shown when no value is selected. */
  placeholder?: string;
  /** Trigger width (px). Default 180. */
  triggerWidth?: number;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

/**
 * Month picker dropdown. Renders the last `monthCount` months ending at the
 * current month. The value is stored as the first day of the month
 * ("YYYY-MM-01") to stay compatible with date-range filters.
 */
export const MonthPicker: React.FC<MonthPickerProps> = ({
  value,
  onMonthChange,
  monthCount = 12,
  placeholder = "Select month",
  triggerWidth = 180,
  disabled,
  className,
  "aria-label": ariaLabel,
}) => {
  const monthOptions = generateMonthOptions(monthCount);
  // Normalize value to "YYYY-MM-01" for matching against options.
  const selected = value ? `${value.slice(0, 7)}-01` : "";

  return (
    <Select value={selected} onValueChange={onMonthChange} disabled={disabled}>
      <SelectTrigger
        className={className}
        style={{ width: triggerWidth }}
        aria-label={ariaLabel}
      >
        <SelectValue placeholder={placeholder}>
          {selected ? formatMonthLabel(selected) : placeholder}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {monthOptions.map((m) => (
          <SelectItem key={m} value={m}>
            {formatMonthLabel(m)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
