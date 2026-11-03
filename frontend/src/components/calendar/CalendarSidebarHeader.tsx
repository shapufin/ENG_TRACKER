import React from "react";
import { ChevronLeft, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CalendarSidebarHeaderProps {
  userCount: number;
  calendarGroup?: string;
  query: string;
  onQueryChange: (query: string) => void;
  onCollapse: () => void;
}

/**
 * The sidebar's identity and search. Kept to two short rows so the roster below
 * keeps the height — the calendar's own grid is the primary surface.
 */
export const CalendarSidebarHeader: React.FC<CalendarSidebarHeaderProps> = ({
  userCount,
  calendarGroup,
  query,
  onQueryChange,
  onCollapse,
}) => (
  <div className="border-border/60 border-b p-2 sm:p-2.5">
    <div className="flex items-center justify-between gap-1.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <Users className="text-primary h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <h2 className="text-foreground truncate text-[11px] font-bold tracking-wider uppercase">
          Team Directory
        </h2>
        <span className="bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold">
          {userCount}
        </span>
      </div>
      <Button
        type="button"
        size="control-icon-sm"
        variant="ghost"
        className="border-border/60 h-6.5 w-6.5 shrink-0 rounded-lg border p-0"
        onClick={onCollapse}
        aria-label="Collapse team sidebar"
        title="Collapse the directory to widen the calendar"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    </div>

    {calendarGroup && (
      <p className="text-muted-foreground mt-1 truncate font-mono text-[10px] font-medium tracking-wider uppercase">
        {calendarGroup}
      </p>
    )}

    <div className="relative mt-2">
      <Search className="text-muted-foreground absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2" />
      <input
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search..."
        aria-label="Search member"
        className="border-border/60 bg-muted/30 placeholder:text-muted-foreground text-foreground focus:ring-primary/40 h-7 w-full rounded-lg border pr-2 pl-6.5 text-[11px] focus:ring-1 focus:outline-hidden"
      />
    </div>
  </div>
);
