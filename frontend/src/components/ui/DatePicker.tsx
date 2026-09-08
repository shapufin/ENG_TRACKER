/**
 * DatePicker component with calendar popup.
 * Displays and accepts dates in DD/MM/YYYY format.
 * Uses Radix UI Popover with Portal for reliable rendering.
 */

import React, { useState, useCallback } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { Input } from "./input";
import { CalendarPopoverContent } from "./CalendarPopoverContent";
import { formatDateDDMMYYYY, parseDDMMYYYYDate } from "@/lib/date-format-utils";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
}

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  placeholder = "DD/MM/YYYY",
  className = "",
  disabled = false,
  id,
}) => {
  const [open, setOpen] = useState(false);
  const [draftValue, setDraftValue] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const formattedValue = value ? formatDateDDMMYYYY(value) : "";
  const displayValue = value ? (isEditing ? draftValue : formattedValue) : draftValue;

  // Parse input value to date (DD/MM/YYYY)
  const parseInput = useCallback((input: string): Date | null => parseDDMMYYYYDate(input), []);

  // Handle input change with auto-slash insertion
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsEditing(true);
    const raw = e.target.value.replace(/[^\d]/g, ""); // Only digits

    let formatted = raw;
    if (raw.length > 2) {
      formatted = raw.slice(0, 2) + "/" + raw.slice(2);
    }
    if (raw.length > 4) {
      formatted = formatted.slice(0, 5) + "/" + formatted.slice(5);
    }
    formatted = formatted.slice(0, 10);
    setDraftValue(formatted);

    if (formatted.length === 10) {
      const parsed = parseInput(formatted);
      if (parsed) {
        const isoDate = format(parsed, "yyyy-MM-dd");
        onChange(isoDate);
        setDraftValue("");
        setIsEditing(false);
      }
    }
  };

  // Handle input blur - validate and format
  const handleInputBlur = () => {
    setIsEditing(false);
    const parsed = parseInput(draftValue);
    if (parsed) {
      const isoDate = format(parsed, "yyyy-MM-dd");
      onChange(isoDate);
      setDraftValue("");
    } else if (value) {
      setDraftValue("");
    }
  };

  const handleDateSelect = (_date: Date, isoDate: string) => {
    onChange(isoDate);
    setDraftValue("");
    setIsEditing(false);
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className="relative inline-flex w-full">
        <Input
          id={id}
          type="text"
          value={displayValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          placeholder={placeholder}
          disabled={disabled}
          className={cn("pr-10", className)}
          maxLength={10}
        />
        <Popover.Trigger asChild>
          <button
            type="button"
            tabIndex={-1}
            className={cn(
              "absolute right-0 top-0 flex h-10 w-10 items-center justify-center",
              "cursor-pointer border-none bg-transparent",
              "text-muted-foreground hover:text-foreground",
              "pointer-events-auto z-10",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              disabled && "cursor-not-allowed opacity-50"
            )}
            disabled={disabled}
            aria-label="Open calendar"
          >
            <CalendarIcon className="h-4 w-4" />
          </button>
        </Popover.Trigger>
      </div>

      <CalendarPopoverContent value={value} onSelect={handleDateSelect} />
    </Popover.Root>
  );
};
