import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { NavItem } from "./hooks/useVisibleNavItems";

interface HeaderSearchProps {
  items: NavItem[];
}

export const HeaderSearch: React.FC<HeaderSearchProps> = ({ items }) => {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items.filter((item) => item.label.toLowerCase().includes(q)).slice(0, 8);
  }, [items, query]);

  const goTo = (path: string) => {
    navigate(path);
    setQuery("");
    setOpen(false);
  };

  return (
    <Popover open={open && query.trim().length > 0} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            role="searchbox"
            aria-label="Search pages"
            placeholder="Search pages..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) {
                goTo(results[0].path);
              } else if (e.key === "Escape") {
                setQuery("");
                setOpen(false);
              }
            }}
            className="h-9 w-full rounded-full border border-border bg-muted/50 pl-9 pr-3 text-sm outline-none transition-colors focus:border-border-focus focus:bg-card"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-1"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {results.length === 0 ? (
          <p className="px-2 py-2 text-sm text-muted-foreground">
            No pages found for &ldquo;{query.trim()}&rdquo;.
          </p>
        ) : (
          results.map((item) => (
            <button
              key={item.path}
              type="button"
              onClick={() => goTo(item.path)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
            >
              <item.icon className="h-4 w-4 text-muted-foreground" />
              {item.label}
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
};
