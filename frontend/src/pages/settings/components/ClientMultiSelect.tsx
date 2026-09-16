import React, { useState } from "react";
import { ChevronsUpDown, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { Client } from "@/types";

interface ClientMultiSelectProps {
  clients: Client[];
  value: number[];
  onChange: (ids: number[]) => void;
  /** Accessible name for the trigger button (e.g. "Client for Alice A"). */
  triggerLabel: string;
}

/**
 * Compact multi-select for a single row's client set (Client Assignment
 * table). Mirrors the Popover + Checkbox pattern used by `TeamMultiSelect`,
 * scaled down for a table cell.
 */
export const ClientMultiSelect: React.FC<ClientMultiSelectProps> = ({
  clients,
  value,
  onChange,
  triggerLabel,
}) => {
  const [open, setOpen] = useState(false);

  const toggle = (id: number) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  const selectedNames = clients.filter((c) => value.includes(c.id)).map((c) => c.name);
  const label =
    selectedNames.length === 0
      ? "None"
      : selectedNames.length === 1
        ? selectedNames[0]
        : `${selectedNames.length} clients`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={triggerLabel}
          className="min-w-[145px] justify-between bg-input-bg pr-2 font-normal"
        >
          <span className={cn("truncate", value.length === 0 && "text-muted-foreground")}>
            {label}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="start">
        <div className="max-h-60 overflow-y-auto">
          {clients.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              No clients available.
            </div>
          ) : (
            clients.map((c) => {
              const checked = value.includes(c.id);
              return (
                <div
                  key={c.id}
                  role="option"
                  aria-selected={checked}
                  tabIndex={0}
                  onClick={() => toggle(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle(c.id);
                    }
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    checked && "bg-primary/5"
                  )}
                >
                  <Checkbox checked={checked} className="pointer-events-none" />
                  <span className="flex-1 truncate">{c.name}</span>
                  {checked && <Check className="h-3.5 w-3.5 text-primary" />}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
