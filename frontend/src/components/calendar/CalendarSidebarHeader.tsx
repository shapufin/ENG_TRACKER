import React from "react";
import { ChevronLeft, ChevronDown, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/SearchField";

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
  <div className="border-border/60 border-b p-3">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Users className="text-primary h-4 w-4" />
        <h2 className="text-sm font-semibold">Members</h2>
      </div>
      <div className="flex items-center gap-2">
        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-semibold">
          {userCount}
        </span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="border-border/60 bg-background/30 h-9 w-9 rounded-lg border md:h-7 md:w-7"
          onClick={onCollapse}
          aria-label="Collapse team sidebar"
        >
          <ChevronLeft className="text-muted-foreground h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
    {calendarGroup && (
      <p className="text-muted-foreground mt-1 text-xs font-medium tracking-wider uppercase">
        {calendarGroup}
      </p>
    )}
    <SearchField
      className="mt-3"
      controlSize="sm"
      value={query}
      onChange={onQueryChange}
      placeholder="Search member..."
      aria-label="Search member"
    />
    <Button
      type="button"
      variant="outline"
      size="control-sm"
      className="mt-3 w-full justify-between text-xs"
      onClick={onClearUsers}
    >
      All members
      <ChevronDown className="text-muted-foreground h-3.5 w-3.5" />
    </Button>
  </div>
);
