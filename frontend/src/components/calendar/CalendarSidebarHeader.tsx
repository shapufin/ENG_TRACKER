import React from "react";
import { ChevronLeft, ChevronDown, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CalendarSidebarHeaderProps {
  userCount: number;
  calendarGroup?: string;
  query: string;
  onQueryChange: (query: string) => void;
  onCollapse: () => void;
  onClearUsers: () => void;
}

export const CalendarSidebarHeader: React.FC<CalendarSidebarHeaderProps> = ({
  userCount,
  calendarGroup,
  query,
  onQueryChange,
  onCollapse,
  onClearUsers,
}) => (
  <div className="border-b border-border/60 p-3">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Members</h2>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
          {userCount}
        </span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-9 w-9 rounded-lg border border-border/60 bg-background/30 md:h-7 md:w-7"
          onClick={onCollapse}
          aria-label="Collapse team sidebar"
        >
          <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>
    </div>
    {calendarGroup && (
      <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {calendarGroup}
      </p>
    )}
    <div className="relative mt-3">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search member..."
        className="h-8 border-border/60 bg-surface-sunken pl-9 text-xs"
      />
    </div>
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="mt-3 h-8 w-full justify-between rounded-lg border-border/60 bg-background/30 px-3 text-xs"
      onClick={onClearUsers}
    >
      All members
      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
    </Button>
  </div>
);
