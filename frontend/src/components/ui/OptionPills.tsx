import * as React from "react";
import { cn } from "@/lib/utils";
import { toneSurfaceClass, type Tone } from "@/components/ui/tone";

export interface PillOption<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  description?: React.ReactNode;
  /** Tint applied when this option is selected. Defaults to `accent`. */
  tone?: Tone;
  disabled?: boolean;
}

interface OptionPillsProps<T extends string> {
  /** Accessible name for the group. */
  label: string;
  options: PillOption<T>[];
  value: T;
  onChange: (value: T) => void;
  columns?: 2 | 3;
  className?: string;
}

const columnClass = {
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
} as const;

/**
 * Card-pill radio group — the mockup's replacement for a `<select>` on short,
 * high-signal choices (leave type, status, category).
 *
 * A real `role="radiogroup"` with roving tabindex: only the selected option is
 * tabbable, and Arrow keys move the selection, matching native radio semantics.
 */
export function OptionPills<T extends string>({
  label,
  options,
  value,
  onChange,
  columns = 3,
  className,
}: OptionPillsProps<T>) {
  const enabled = options.filter((option) => !option.disabled);
  const buttonRefs = React.useRef(new Map<T, HTMLButtonElement>());

  const moveBy = (delta: number) => {
    if (enabled.length === 0) return;
    const current = enabled.findIndex((option) => option.value === value);
    const next = enabled[(current + delta + enabled.length) % enabled.length];
    onChange(next.value);
    // Roving tabindex: DOM focus must follow the selection, or a keyboard
    // user's focus stays on a now-untabbable (tabIndex=-1) button.
    buttonRefs.current.get(next.value)?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveBy(1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveBy(-1);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className={cn("grid gap-2", columnClass[columns], className)}
    >
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              if (el) buttonRefs.current.set(option.value, el);
              else buttonRefs.current.delete(option.value);
            }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border p-3 text-xs font-bold transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "disabled:pointer-events-none disabled:opacity-50",
              isSelected
                ? toneSurfaceClass[option.tone ?? "accent"]
                : "border-border bg-input-bg text-muted-foreground hover:border-border-focus hover:text-foreground"
            )}
          >
            <span className="flex items-center gap-2">
              {option.icon}
              {option.label}
            </span>
            {option.description && (
              <span className="font-normal text-muted-foreground">{option.description}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
