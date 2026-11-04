import React from "react";
import { cn } from "@/lib/utils";

import type { LeaveDuration } from "./leaveDuration";

const OPTIONS: Array<{ value: LeaveDuration; label: string }> = [
  { value: "full", label: "Full day(s)" },
  { value: "morning", label: "Morning (AM)" },
  { value: "afternoon", label: "Afternoon (PM)" },
];

interface LeaveDurationPickerProps {
  value: LeaveDuration;
  onChange: (value: LeaveDuration) => void;
  idPrefix?: string;
  className?: string;
}

/** Full day or one half of a day. Arrow keys move the selection, as in any radio group. */
export const LeaveDurationPicker: React.FC<LeaveDurationPickerProps> = ({
  value,
  onChange,
  idPrefix = "leave-duration",
  className,
}) => {
  const labelId = `${idPrefix}-label`;

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const next = OPTIONS[(index + step + OPTIONS.length) % OPTIONS.length];
    onChange(next.value);
    document.getElementById(`${idPrefix}-${next.value}`)?.focus();
  };

  return (
    <div className={className}>
      <span id={labelId} className="text-xs font-medium">
        Duration
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3"
      >
        {OPTIONS.map((option, index) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              id={`${idPrefix}-${option.value}`}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(option.value)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={cn(
                "focus-visible:ring-focus flex min-h-11 touch-manipulation items-center justify-center rounded-xl border px-3 text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:outline-hidden motion-reduce:transition-none sm:min-h-9",
                selected
                  ? "border-primary/60 bg-primary/10 text-foreground ring-primary/20 shadow-sm ring-2"
                  : "border-border bg-surface-sunken text-muted-foreground hover:text-foreground"
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
