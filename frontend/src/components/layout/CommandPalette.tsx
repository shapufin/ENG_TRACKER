import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, UserRound } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { userService } from "@/services/userService";
import { userRoleTab, type PaletteItem } from "./paletteItems";
import type { TLFilter } from "@/types";
import { pushRecent, readRecents } from "./paletteRecents";

interface CommandPaletteProps {
  /** Already filtered by role, CR scope and active plugins. */
  items: PaletteItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Enables per-user "Recent" pages. */
  userId?: number;
  /** Admin only: also search users (server-scoped via getProfiles). */
  userSearch?: boolean;
  /** Accessible name of the search box. */
  searchLabel?: string;
}

interface Option {
  id: string;
  section: string;
  label: string;
  secondary?: string;
  icon: React.ElementType;
  to: string;
  recordPath?: string;
}

interface FoundUser {
  id: number;
  label: string;
  username: string;
  /** Users-page role tab that contains this person (the default tab is plain employees). */
  role: TLFilter;
}

const LISTBOX_ID = "command-palette-list";
const MIN_USER_QUERY = 2;
const DEBOUNCE_MS = 250;
const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "-");

/** Debounced server search; a counter drops responses that belong to an older query. */
const useUserSearch = (query: string, enabled: boolean): FoundUser[] => {
  const [found, setFound] = useState<{ q: string; users: FoundUser[] }>({ q: "", users: [] });
  const latest = useRef(0);
  const q = query.trim();

  useEffect(() => {
    if (!enabled || q.length < MIN_USER_QUERY) return;
    const ticket = ++latest.current;
    const timer = setTimeout(() => {
      userService
        .getProfiles({ search: q, page_size: 5 })
        .then((res) => {
          if (ticket !== latest.current) return;
          setFound({
            q,
            users: res.results.map((p) => ({
              id: p.user.id,
              username: p.user.username,
              label: p.user.full_name || p.user.username,
              role: userRoleTab(p),
            })),
          });
        })
        .catch(() => {
          if (ticket === latest.current) setFound({ q, users: [] });
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q, enabled]);

  return enabled && q.length >= MIN_USER_QUERY && found.q === q ? found.users : [];
};

/** Ctrl/Cmd+K jump-to-page palette with recents and (admin) user search. */
export const CommandPalette: React.FC<CommandPaletteProps> = ({
  items,
  open,
  onOpenChange,
  userId,
  userSearch = false,
  searchLabel = "Search pages",
}) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const users = useUserSearch(query, userSearch);

  // Re-read each time the palette opens so a visit made elsewhere shows up.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recents = useMemo(() => readRecents(userId), [open, userId]);

  const options = useMemo<Option[]>(() => {
    const q = query.trim().toLowerCase();
    const page = (i: PaletteItem, section: string): Option => ({
      id: `${slug(section)}-${slug(i.path)}`,
      section,
      label: i.label,
      icon: i.icon,
      to: i.path,
      recordPath: i.path,
    });
    if (!q) {
      const recent = recents
        .map((p) => items.find((i) => i.path === p))
        .filter((i): i is PaletteItem => !!i)
        .map((i) => page(i, "Recent"));
      return [...recent, ...items.map((i) => page(i, i.group))];
    }
    const pages = items
      .filter((i) => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q))
      .map((i) => page(i, i.group));
    const people = users.map<Option>((u) => ({
      id: `users-${u.id}`,
      section: "Users",
      label: u.label,
      secondary: u.username === u.label ? undefined : u.username,
      icon: UserRound,
      to: `/admin/users?q=${encodeURIComponent(u.username)}${u.role === "employee" ? "" : `&role=${u.role}`}`,
    }));
    return [...pages, ...people];
  }, [items, query, recents, users]);

  const current = Math.min(active, Math.max(options.length - 1, 0));

  const close = (next: boolean) => {
    if (!next) {
      setQuery("");
      setActive(0);
    }
    onOpenChange(next);
  };

  const go = (o: Option) => {
    if (o.recordPath) pushRecent(userId, o.recordPath);
    navigate(o.to);
    close(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!options.length) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((current + step + options.length) % options.length);
    } else if (e.key === "Enter" && options[current]) {
      e.preventDefault();
      go(options[current]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="md" padded={false} hideClose>
        <DialogTitle className="sr-only">Go to page</DialogTitle>
        <DialogDescription className="sr-only">
          Type to filter pages{userSearch ? " or find a user" : ""}, use the arrow keys to choose
          one and press Enter.
        </DialogDescription>
        <div className="border-border flex items-center gap-2 border-b px-3">
          <Search className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden />
          <input
            autoFocus
            role="combobox"
            aria-expanded
            aria-controls={LISTBOX_ID}
            aria-activedescendant={options[current]?.id}
            aria-label={searchLabel}
            placeholder={userSearch ? "Search pages and users…" : "Search pages…"}
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
          <ul id={LISTBOX_ID} role="listbox" aria-label="Results">
            {options.length === 0 && (
              <li role="presentation" className="text-muted-foreground p-4 text-center text-sm">
                No matches
              </li>
            )}
            {options.map((o, index) => {
              const Icon = o.icon;
              return (
                <React.Fragment key={o.id}>
                  {(index === 0 || options[index - 1].section !== o.section) && (
                    <li
                      role="presentation"
                      className="text-muted-foreground text-micro-lg px-2 pt-2 pb-1 font-mono font-semibold tracking-wider uppercase"
                    >
                      {o.section}
                    </li>
                  )}
                  <li
                    id={o.id}
                    role="option"
                    aria-selected={index === current}
                    onMouseMove={() => setActive(index)}
                    onClick={() => go(o)}
                    className={cn(
                      "flex min-h-9 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm",
                      index === current ? "bg-primary/10 text-foreground" : "text-muted-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{o.label}</span>
                    {o.secondary && (
                      <span className="text-muted-foreground ml-auto truncate font-mono text-xs">
                        {o.secondary}
                      </span>
                    )}
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
