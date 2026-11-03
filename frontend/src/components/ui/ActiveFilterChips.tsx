import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ActiveFilterChip {
  id: string;
  /** Filter name, e.g. "Team". */
  label: string;
  /** Chosen value, e.g. "Core Team". */
  value: string;
  onRemove: () => void;
}

interface ActiveFilterChipsProps {
  chips: ActiveFilterChip[];
  onReset: () => void;
}

/**
 * Summary row under a filter bar: one removable chip per active filter plus a
 * reset. Hidden when nothing is filtered, so an idle bar stays quiet.
 */
export const ActiveFilterChips: React.FC<ActiveFilterChipsProps> = ({ chips, onReset }) => {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Active filters">
      {chips.map((chip) => {
        const text = `${chip.label}: ${chip.value}`;
        return (
          <span
            key={chip.id}
            className="border-primary/30 bg-primary/10 text-primary inline-flex h-7 items-center gap-1 rounded-lg border pr-1 pl-2.5 text-xs font-medium"
          >
            {text}
            <button
              type="button"
              aria-label={`Remove filter ${text}`}
              onClick={chip.onRemove}
              className="hover:bg-primary/15 focus-visible:ring-focus inline-flex h-5 w-5 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-hidden"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        );
      })}
      <Button type="button" variant="ghost" size="sm" onClick={onReset}>
        Reset all filters
      </Button>
    </div>
  );
};
