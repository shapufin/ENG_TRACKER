/**
 * FilterMultiSelect — generic searchable multi-select for analytics filters.
 *
 * Uses Popover + search + checkbox list + selected badges. Scales to
 * hundreds of items (teams, users) without consuming vertical space.
 * Follows the same UX pattern as the shared `TeamMultiSelect` but is
 * generic (accepts any `{ id, label, sublabel? }` option shape).
 */
import React, { useMemo, useState } from "react";
import { ChevronsUpDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/SearchField";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export interface FilterOption {
  id: string | number;
  label: string;
  sublabel?: string;
}

interface FilterMultiSelectProps {
  options: FilterOption[];
  /** Selected option IDs (as strings). */
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  /** When true, the trigger button is rendered in a compact size. */
  compact?: boolean;
  disabled?: boolean;
}

export const FilterMultiSelect: React.FC<FilterMultiSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = "Select...",
  compact = false,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.sublabel?.toLowerCase().includes(q) ?? false)
    );
  }, [options, query]);

  // Render cap: only render the first 100 filtered items to keep DOM
  // manageable with 500+ options. Search still filters the full list;
  // users see a "showing X of Y" hint when truncated.
  const RENDER_CAP = 100;
  const visible = filtered.slice(0, RENDER_CAP);
  const hiddenCount = filtered.length - visible.length;

  const selectedOptions = useMemo(
    () => options.filter((o) => value.includes(String(o.id))),
    [options, value]
  );

  const toggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  const handleClear = () => {
    onChange([]);
    setQuery("");
  };

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size={compact ? "control-sm" : undefined}
            className="w-full justify-between font-normal"
            disabled={disabled}
          >
            <span
              className="truncate"
              title={
                selectedOptions.length === 1
                  ? selectedOptions[0].label
                  : selectedOptions.length > 1
                    ? `${selectedOptions.length} selected`
                    : placeholder
              }
            >
              {selectedOptions.length === 0 ? (
                <span className="text-muted-foreground">{placeholder}</span>
              ) : selectedOptions.length === 1 ? (
                selectedOptions[0].label
              ) : (
                `${selectedOptions.length} selected`
              )}
            </span>
            <ChevronsUpDown className="text-muted-foreground ml-2 h-4 w-4 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2" align="start">
          <SearchField
            autoFocus
            value={query}
            onChange={setQuery}
            placeholder="Search..."
            aria-label="Search options"
          />
          <div className="thin-scrollbar mt-2 max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-muted-foreground px-2 py-6 text-center text-xs">
                No results found.
              </div>
            ) : (
              <>
                {visible.map((o) => {
                  const checked = value.includes(String(o.id));
                  return (
                    <div
                      key={o.id}
                      role="option"
                      aria-selected={checked}
                      tabIndex={0}
                      onClick={() => toggle(String(o.id))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggle(String(o.id));
                        }
                      }}
                      className={cn(
                        "hover:bg-muted focus-visible:ring-ring flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-sm focus-visible:ring-2 focus-visible:outline-hidden",
                        checked && "bg-primary/5"
                      )}
                    >
                      <Checkbox checked={checked} className="pointer-events-none" />
                      <span className="flex-1 truncate" title={o.label}>
                        {o.label}
                      </span>
                      {o.sublabel && (
                        <span className="text-muted-foreground shrink-0 text-xs">{o.sublabel}</span>
                      )}
                    </div>
                  );
                })}
                {hiddenCount > 0 && (
                  <div className="text-muted-foreground px-2 py-1.5 text-center text-xs">
                    Showing {visible.length} of {filtered.length}. Refine search to see more.
                  </div>
                )}
              </>
            )}
          </div>
          {selectedOptions.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="text-muted-foreground hover:text-foreground mt-2 w-full text-center text-xs"
            >
              Clear all
            </button>
          )}
        </PopoverContent>
      </Popover>

      {selectedOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {selectedOptions.map((o) => (
            <span
              key={o.id}
              className="bg-primary/10 text-foreground inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
            >
              {o.label}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => toggle(String(o.id))}
                  className="text-foreground/60 hover:text-foreground ml-0.5"
                  aria-label={`Remove ${o.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
