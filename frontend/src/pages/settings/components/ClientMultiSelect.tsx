import React, { useState } from "react";
import { ChevronsUpDown, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/SearchField";
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
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle ? clients.filter((c) => c.name.toLowerCase().includes(needle)) : clients;

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
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={triggerLabel}
          className="bg-input-bg min-w-[145px] justify-between pr-2 font-normal"
        >
          <span className={cn("truncate", value.length === 0 && "text-muted-foreground")}>
            {label}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="start">
        {clients.length > 6 && (
          <div className="p-1 pb-2">
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder="Search clients"
              aria-label="Search clients"
              controlSize="sm"
              autoFocus
            />
          </div>
        )}
        <div className="max-h-60 overflow-y-auto" onWheel={(e) => e.stopPropagation()}>
          {clients.length === 0 ? (
            <div className="text-muted-foreground px-2 py-3 text-center text-xs">
              No clients available.
            </div>
          ) : shown.length === 0 ? (
            <div className="text-muted-foreground px-2 py-3 text-center text-xs">
              No clients match.
            </div>
          ) : (
            shown.map((c) => {
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
                    "hover:bg-muted focus-visible:ring-ring flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-sm focus-visible:ring-2 focus-visible:outline-hidden",
                    checked && "bg-primary/5"
                  )}
                >
                  <Checkbox checked={checked} className="pointer-events-none" />
                  <span className="flex-1 truncate">{c.name}</span>
                  {checked && <Check className="text-primary h-3.5 w-3.5" />}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
