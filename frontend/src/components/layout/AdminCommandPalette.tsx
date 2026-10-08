import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { AdminNavItem } from "./hooks/useAdminNavItems";

interface AdminCommandPaletteProps {
  /** Already filtered by role, CR scope and active plugins (useAdminNavItems). */
  items: AdminNavItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LISTBOX_ID = "admin-command-palette-list";
const optionId = (path: string) => `admin-command-option-${path.replace(/[^a-z0-9]+/gi, "-")}`;

/** Ctrl/Cmd+K jump-to-page palette. Navigation only; never lists a link the viewer cannot use. */
export const AdminCommandPalette: React.FC<AdminCommandPaletteProps> = ({
  items,
  open,
  onOpenChange,
}) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q)
    );
  }, [items, query]);

  const current = Math.min(active, Math.max(matches.length - 1, 0));

  const close = (next: boolean) => {
    if (!next) {
      setQuery("");
      setActive(0);
    }
    onOpenChange(next);
  };

  const go = (item: AdminNavItem) => {
    navigate(item.path);
    close(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!matches.length) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((current + step + matches.length) % matches.length);
    } else if (e.key === "Enter" && matches[current]) {
      e.preventDefault();
      go(matches[current]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="md" padded={false} hideClose>
        <DialogTitle className="sr-only">Go to page</DialogTitle>
        <DialogDescription className="sr-only">
          Type to filter admin pages, use the arrow keys to choose one and press Enter.
        </DialogDescription>
        <div className="border-border flex items-center gap-2 border-b px-3">
          <Search className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden />
          <input
            autoFocus
            role="combobox"
            aria-expanded
            aria-controls={LISTBOX_ID}
            aria-activedescendant={matches[current] ? optionId(matches[current].path) : undefined}
            aria-label="Search admin pages"
            placeholder="Search pages…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            className="placeholder:text-muted-foreground h-12 w-full bg-transparent text-sm outline-hidden"
          />
        </div>
        <DialogBody className="max-h-[min(360px,50vh)] space-y-0 p-2">
          <ul id={LISTBOX_ID} role="listbox" aria-label="Admin pages" className="space-y-0">
            {matches.length === 0 && (
              <li role="presentation" className="text-muted-foreground p-4 text-center text-sm">
                No matches
              </li>
            )}
            {matches.map((item, index) => {
              const showGroup = index === 0 || matches[index - 1].group !== item.group;
              const Icon = item.icon;
              return (
                <React.Fragment key={item.path}>
                  {showGroup && (
                    <li
                      role="presentation"
                      className="text-muted-foreground text-micro-lg px-2 pt-2 pb-1 font-mono font-semibold tracking-wider uppercase"
                    >
                      {item.group}
                    </li>
                  )}
                  <li
                    id={optionId(item.path)}
                    role="option"
                    aria-selected={index === current}
                    onMouseMove={() => setActive(index)}
                    onClick={() => go(item)}
                    className={cn(
                      "flex min-h-9 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm",
                      index === current ? "bg-primary/10 text-foreground" : "text-muted-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{item.label}</span>
                  </li>
                </React.Fragment>
              );
            })}
          </ul>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
};
