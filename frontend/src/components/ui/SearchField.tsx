import * as React from "react";
import { Search, X } from "lucide-react";
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
  controlSize?: ControlSize;
  autoFocus?: boolean;
  /** Pressing "/" outside a field, dialog or menu focuses this field. Opt in on the page's one primary search. */
  slashFocus?: boolean;
  disabled?: boolean;
  name?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  /** Lets a visible <Label htmlFor> point at the input. */
  id?: string;
  className?: string;
}

/** The one search field: icon slot, clear button, Esc-to-clear. Padding lives here, never at call sites. */
export const SearchField = ({
  value,
  onChange,
  placeholder,
  "aria-label": ariaLabel,
  onClear,
  controlSize,
  autoFocus,
  slashFocus,
  disabled,
  name,
  inputMode,
  onKeyDown,
  id,
  className,
}: SearchFieldProps) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [local, setLocal] = React.useState(value);

  // Follow external value changes (reset, URL state) without an effect.
  const [seen, setSeen] = React.useState(value);
  if (seen !== value) {
    setSeen(value);
    setLocal(value);
  }

  const emit = (next: string) => {
    setLocal(next);
    onChange(next);
  };

  const clear = () => {
    emit("");
    onClear?.();
    // The button unmounts with the text; keep the keyboard user in the field.
    inputRef.current?.focus();
  };

  // Esc clears a non-empty field and must not also close the Dialog/Popover around it. Radix listens for
  // Escape on `document` in the capture phase, so only a window-capture listener runs early enough.
  const clearRef = React.useRef(clear);
  React.useEffect(() => {
    clearRef.current = clear;
  });
  const hasValue = local !== "";
  React.useEffect(() => {
    if (!hasValue) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.target !== inputRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      clearRef.current();
    };
    window.addEventListener("keydown", onEscape, true);
    return () => window.removeEventListener("keydown", onEscape, true);
  }, [hasValue]);

  React.useEffect(() => {
    if (!slashFocus) return;
    const onSlash = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"],[role="menu"],[role="listbox"]')) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onSlash);
    return () => window.removeEventListener("keydown", onSlash);
  }, [slashFocus]);

  return (
    <div className={cn("relative w-full", className)}>
      <Search
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
      />
      <Input
        ref={inputRef}
        type="search"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        placeholder={placeholder}
        aria-label={ariaLabel}
        controlSize={controlSize}
        autoFocus={autoFocus}
        disabled={disabled}
        name={name}
        inputMode={inputMode}
        id={id}
        value={local}
        onChange={(e) => emit(e.target.value)}
        onKeyDown={onKeyDown}
        className="pr-9 pl-9 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
      />
      <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-1">
        {local && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={clear}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-focus inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-hidden"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};
