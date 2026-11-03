import * as React from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { controlSurface, type ControlSize } from "./controlSurface";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Secondary line, searched together with the label (team, role, code). */
  description?: string;
  /** Shown in a small circle before the label. */
  initials?: string;
  disabled?: boolean;
}

export interface SearchableComboboxProps {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  /** Accessible name of the trigger, also used for "Clear <name>". */
  ariaLabel: string;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Adds a clear button next to the chevron while a value is selected. */
  clearable?: boolean;
  disabled?: boolean;
  controlSize?: ControlSize;
  className?: string;
}

const matches = (option: ComboboxOption, query: string) =>
  `${option.label} ${option.description ?? ""}`.toLowerCase().includes(query.toLowerCase());

const nextEnabled = (list: ComboboxOption[], from: number, step: 1 | -1) => {
  for (let i = from + step; i >= 0 && i < list.length; i += step) {
    if (!list[i].disabled) return i;
  }
  return from;
};

const OptionBody: React.FC<{ option: ComboboxOption }> = ({ option }) => (
  <>
    {option.initials && (
      <span
        aria-hidden="true"
        className="bg-muted text-muted-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
      >
        {option.initials}
      </span>
    )}
    <span className="min-w-0">
      <span className="block truncate">{option.label}</span>
      {option.description && (
        <span className="text-muted-foreground block truncate text-xs">{option.description}</span>
      )}
    </span>
  </>
);

/**
 * Single-select picker with type-ahead. Use it where a plain Select gets long or
 * people need identifying (leader, employee, team pickers); keep `Select` for
 * short fixed lists. Surface comes from `controlSurface`, so it lines up with
 * Input, SelectTrigger and DateRangePicker in a toolbar.
 */
export const SearchableCombobox: React.FC<SearchableComboboxProps> = ({
  options,
  value,
  onChange,
  ariaLabel,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  clearable = false,
  disabled = false,
  controlSize,
  className,
}) => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [highlight, setHighlight] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listId = React.useId();

  const selected = options.find((o) => o.value === value) ?? null;
  const visible = options.filter((o) => matches(o, query));
  const active = Math.min(highlight, Math.max(visible.length - 1, 0));
  const showClear = clearable && selected !== null && !disabled;

  const handleOpenChange = (next: boolean) => {
    if (disabled) return;
    setOpen(next);
    if (next) {
      setQuery("");
      setHighlight(
        Math.max(
          options.findIndex((o) => o.value === value),
          0
        )
      );
    }
  };

  const choose = (option: ComboboxOption | undefined) => {
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight(nextEnabled(visible, active, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight(nextEnabled(visible, active, -1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(visible[active]);
    }
  };

  return (
    <div className={cn("relative w-full", className)}>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-label={ariaLabel}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            disabled={disabled}
            className={cn(
              "flex items-center justify-between gap-2 text-left",
              controlSurface({ controlSize }),
              showClear && "pr-14"
            )}
          >
            <span
              className={cn(
                "flex min-w-0 items-center gap-2",
                !selected && "text-muted-foreground"
              )}
            >
              {selected?.initials && (
                <span
                  aria-hidden="true"
                  className="bg-muted text-muted-foreground flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                >
                  {selected.initials}
                </span>
              )}
              <span className="truncate">{selected ? selected.label : placeholder}</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] min-w-56 p-1"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <input
            ref={inputRef}
            type="search"
            value={query}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            aria-controls={listId}
            aria-activedescendant={
              visible[active] ? `${listId}-${visible[active].value}` : undefined
            }
            onChange={(event) => {
              setQuery(event.target.value);
              setHighlight(0);
            }}
            onKeyDown={handleKeyDown}
            className={cn(controlSurface({ controlSize: "sm" }), "mb-1")}
          />
          <ul
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            className="max-h-60 overflow-y-auto"
          >
            {visible.length === 0 ? (
              <li className="text-muted-foreground px-3 py-4 text-center text-sm">No results</li>
            ) : (
              visible.map((option, index) => {
                const isSelected = option.value === value;
                return (
                  <li
                    key={option.value}
                    id={`${listId}-${option.value}`}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled || undefined}
                    onClick={() => choose(option)}
                    onMouseEnter={() => !option.disabled && setHighlight(index)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                      index === active && "bg-muted",
                      isSelected && "font-medium",
                      option.disabled && "cursor-not-allowed opacity-50"
                    )}
                  >
                    <OptionBody option={option} />
                    {isSelected && (
                      <Check className="text-primary ml-auto h-4 w-4 shrink-0" aria-hidden="true" />
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </PopoverContent>
      </Popover>
      {showClear && (
        <button
          type="button"
          aria-label={`Clear ${ariaLabel}`}
          onClick={() => onChange(null)}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-focus absolute top-1/2 right-8 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-hidden"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};
