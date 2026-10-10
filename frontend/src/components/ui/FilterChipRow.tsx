import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { FacetRow } from "@/components/admin/FacetRow";
import { Chip } from "@/components/ui/Chip";
import { cn } from "@/lib/utils";

export interface FilterChipOption<V extends string = string> {
  value: V;
  label: string;
  count?: number;
  icon?: LucideIcon;
  /** Dashed outline for "missing data" buckets such as "No tech". */
  emphasis?: "default" | "missing";
}

export interface FilterChipRowProps<V extends string = string> {
  /** FacetRow label (group name, aria-labelledby). */
  label: string;
  options: FilterChipOption<V>[];
  /** Single-select callers pass [value]. */
  selected: readonly V[];
  onToggle: (value: V) => void;
}

/** A labelled row of toggle chips with optional icon and count. One scrolling row on phones, wraps from `sm`. */
export function FilterChipRow<V extends string>({
  label,
  options,
  selected,
  onToggle,
}: FilterChipRowProps<V>) {
  return (
    <FacetRow label={label}>
      <div className="no-scrollbar flex w-full snap-x flex-nowrap items-center gap-2 overflow-x-auto sm:w-auto sm:flex-wrap sm:overflow-visible">
        {options.map((option) => {
          const pressed = selected.includes(option.value);
          const Icon = option.icon;
          return (
            <Chip
              key={option.value}
              pressed={pressed}
              onClick={() => onToggle(option.value)}
              className={cn("snap-start", option.emphasis === "missing" && "border-dashed")}
            >
              {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
              {option.label}
              {option.count !== undefined && (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-xs tabular-nums",
                    pressed ? "bg-primary-foreground/20" : "bg-foreground/[0.06]"
                  )}
                >
                  {option.count}
                </span>
              )}
            </Chip>
          );
        })}
      </div>
    </FacetRow>
  );
}
