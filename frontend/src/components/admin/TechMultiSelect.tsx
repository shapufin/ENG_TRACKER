/** Multi-select for independent user technology assignments. */
import React, { useMemo, useState } from "react";
import { ChevronsUpDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/SearchField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { Tech } from "@/types";

const NO_LEVEL = "none";

interface TechMultiSelectProps {
  techs: Tech[];
  value: number[];
  onChange: (techIds: number[]) => void;
  /** Level held per Tech, keyed by tech id. Omit to hide the level pickers
   * entirely (callers that only care about membership). */
  levelByTech?: Record<number, number | null>;
  onLevelChange?: (techId: number, levelId: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

export const TechMultiSelect: React.FC<TechMultiSelectProps> = ({
  techs,
  value,
  onChange,
  levelByTech,
  onLevelChange,
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

  const showLevels = Boolean(levelByTech && onLevelChange);

  const toggle = (id: number) => {
    if (value.includes(id)) {
      onChange(value.filter((item) => item !== id));
      // Drop the grade with the assignment, so re-adding the tech never
      // resurrects a level the user thought they had removed.
      onLevelChange?.(id, null);
    } else {
      onChange([...value, id]);
    }
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
            <ChevronsUpDown className="text-muted-foreground ml-2 h-4 w-4 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-2" align="start">
          <SearchField
            autoFocus
            value={query}
            onChange={setQuery}
            placeholder="Filter Tech..."
            aria-label="Filter Tech"
          />
          <div className="mt-2 max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-muted-foreground px-2 py-6 text-center text-xs">
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
                      "hover:bg-muted focus-visible:ring-ring flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-sm focus-visible:ring-2 focus-visible:outline-hidden",
                      checked && "bg-primary/5"
                    )}
                  >
                    <Checkbox checked={checked} className="pointer-events-none" />
                    <span className="flex-1 truncate" title={tech.name}>
                      {tech.name}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs">{tech.code}</span>
                  </div>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
      {showLevels && selected.length > 0 && (
        <div className="space-y-1.5">
          {selected.map((tech) => {
            const levels = (tech.levels ?? []).filter((level) => level.is_active);
            if (levels.length === 0) return null;
            const selectId = `tech-level-${tech.id}`;
            return (
              <div key={tech.id} className="flex items-center gap-2">
                <label htmlFor={selectId} className="w-32 shrink-0 truncate text-xs">
                  {tech.name}
                </label>
                <Select
                  disabled={disabled}
                  value={levelByTech?.[tech.id] ? String(levelByTech[tech.id]) : NO_LEVEL}
                  onValueChange={(v) => onLevelChange?.(tech.id, v === NO_LEVEL ? null : Number(v))}
                >
                  <SelectTrigger id={selectId} controlSize="sm" className="flex-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_LEVEL}>No level</SelectItem>
                    {levels.map((level) => (
                      <SelectItem key={level.id} value={String(level.id)}>
                        {level.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      )}
      {(selected.length > 0 || inactiveSelected.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {selected.map((tech) => (
            <span
              key={tech.id}
              className="bg-primary/10 text-foreground inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs"
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
              className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs"
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
