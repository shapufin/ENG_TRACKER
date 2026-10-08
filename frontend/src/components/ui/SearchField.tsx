import * as React from "react";
import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "./input";
import type { ControlSize } from "./controlSurface";

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Required: a placeholder is not an accessible name. */
  "aria-label": string;
  onClear?: () => void;
  /** Hint such as "/" shown while empty, hidden on narrow screens. */
  shortcut?: string;
  loading?: boolean;
  controlSize?: ControlSize;
  className?: string;
  /** 0 (default) = immediate. */
  debounceMs?: number;
}

/** The one search field: icon slot, clear button, Esc-to-clear. Padding lives here, never at call sites. */
export const SearchField = ({
  value,
  onChange,
  placeholder,
  "aria-label": ariaLabel,
  onClear,
  shortcut,
  loading,
  controlSize,
  className,
  debounceMs = 0,
}: SearchFieldProps) => {
  const [local, setLocal] = React.useState(value);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Follow external value changes (reset, URL state) without an effect.
  const [seen, setSeen] = React.useState(value);
  if (seen !== value) {
    setSeen(value);
    setLocal(value);
  }
  React.useEffect(() => () => clearTimeout(timer.current), []);

  const emit = (next: string) => {
    setLocal(next);
    clearTimeout(timer.current);
    if (debounceMs > 0 && next !== "") {
      timer.current = setTimeout(() => onChange(next), debounceMs);
    } else {
      onChange(next);
    }
  };

  const clear = () => {
    emit("");
    onClear?.();
  };

  return (
    <div
      role="search"
      aria-busy={loading ? true : undefined}
      className={cn("relative w-full", className)}
    >
      <Search
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
      />
      <Input
        type="search"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        placeholder={placeholder}
        aria-label={ariaLabel}
        controlSize={controlSize}
        value={local}
        onChange={(e) => emit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && local) {
            e.preventDefault();
            clear();
          }
        }}
        className="pr-9 pl-9 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
      />
      <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-1">
        {loading && (
          <Loader2
            aria-hidden="true"
            className="text-muted-foreground h-4 w-4 animate-spin motion-reduce:animate-none"
          />
        )}
        {local ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={clear}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-focus inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-hidden"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        ) : (
          shortcut && (
            <kbd className="text-muted-foreground border-control-edge hidden rounded border px-1.5 text-xs sm:inline">
              {shortcut}
            </kbd>
          )
        )}
      </div>
    </div>
  );
};
