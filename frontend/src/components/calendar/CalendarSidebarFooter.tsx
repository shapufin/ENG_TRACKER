import React from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { typeFilters } from "./calendarSidebarUtils";

interface CalendarSidebarFooterProps {
  hiddenCount: number;
  expanded: boolean;
  onToggleExpanded: () => void;
  showStandby: boolean;
  showVacation: boolean;
  showSick: boolean;
  onToggleType: (type: "standby" | "vacation" | "sick") => void;
}

const typeState = (showStandby: boolean, showVacation: boolean, showSick: boolean) => ({
  vacation: showVacation,
  standby: showStandby,
  sick: showSick,
});

export const CalendarSidebarFooter: React.FC<CalendarSidebarFooterProps> = ({
  hiddenCount,
  expanded,
  onToggleExpanded,
  showStandby,
  showVacation,
  showSick,
  onToggleType,
}) => {
  const state = typeState(showStandby, showVacation, showSick);

  return (
    <div className="space-y-3 border-t border-border/60 p-3">
      {hiddenCount > 0 && !expanded && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-full text-xs text-muted-foreground"
          onClick={onToggleExpanded}
        >
          Show {hiddenCount} more
          <ChevronDown className="ml-1 h-3.5 w-3.5" />
        </Button>
      )}
      {expanded && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-full text-xs text-muted-foreground"
          onClick={onToggleExpanded}
        >
          Show less
          <ChevronDown className="ml-1 h-3.5 w-3.5 rotate-180" />
        </Button>
      )}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {typeFilters.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => onToggleType(filter.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 transition md:px-0 md:py-0",
              state[filter.key] ? "text-foreground" : "opacity-40"
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", filter.dot)} />
            {filter.label}
          </button>
        ))}
      </div>
    </div>
  );
};
