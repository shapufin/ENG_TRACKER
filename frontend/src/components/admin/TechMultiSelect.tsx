/** Multi-select for independent user technology assignments. */
import React, { useMemo, useState } from "react";
import { ChevronsUpDown, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { Tech } from "@/types";

interface TechMultiSelectProps {
  techs: Tech[];
  value: number[];
  onChange: (techIds: number[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

export const TechMultiSelect: React.FC<TechMultiSelectProps> = ({
  techs,
  value,
  onChange,
  placeholder = "Select Tech...",
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const activeTechs = useMemo(() => (techs || []).filter((tech) => tech.is_active), [techs]);
  const inactiveSelected = useMemo(
    () => (techs || []).filter((tech) => !tech.is_active && value.includes(tech.id)),
    [techs, value]
  );
  const filtered = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    if (!normalized) return activeTechs;
    return activeTechs.filter(
      (tech) =>
        tech.name.toLowerCase().includes(normalized) || tech.code.toLowerCase().includes(normalized)
    );
  }, [activeTechs, query]);
  const selected = useMemo(
    () => activeTechs.filter((tech) => value.includes(tech.id)),
    [activeTechs, value]
  );

  const toggle = (id: number) => {
    onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between font-normal"
            disabled={disabled}
          >
            <span
              className="truncate"
              title={
                selected.length === 1
                  ? `${selected[0].name} (${selected[0].code})`
                  : selected.length > 1
                    ? `${selected.length} Tech selected`
                    : placeholder
              }
            >
              {selected.length === 0 ? (
                <span className="text-muted-foreground">{placeholder}</span>
              ) : selected.length === 1 ? (
                `${selected[0].name} (${selected[0].code})`
              ) : (
                `${selected.length} Tech selected`
              )}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-2" align="start">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter Tech..."
              className="pl-8"
            />
          </div>
          <div className="mt-2 max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                No Tech found.
              </div>
            ) : (
              filtered.map((tech) => {
                const checked = value.includes(tech.id);
                return (
                  <div
                    key={tech.id}
                    role="option"
                    aria-selected={checked}
                    tabIndex={0}
                    onClick={() => toggle(tech.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggle(tech.id);
                      }
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      checked && "bg-primary/5"
                    )}
                  >
                    <Checkbox checked={checked} className="pointer-events-none" />
                    <span className="flex-1 truncate" title={tech.name}>
                      {tech.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{tech.code}</span>
                  </div>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
      {(selected.length > 0 || inactiveSelected.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {selected.map((tech) => (
            <span
              key={tech.id}
              className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-xs text-foreground"
            >
              {tech.name}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => toggle(tech.id)}
                  aria-label={`Remove ${tech.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          {inactiveSelected.map((tech) => (
            <span
              key={tech.id}
              className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              title="Inactive Tech — manage via Tech member dialog"
            >
              {tech.name}
              <span>(inactive)</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
