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
    <div className="border-border/60 space-y-1.5 border-t p-2">
      {hiddenCount > 0 && !expanded && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground h-6.5 w-full text-[11px]"
          onClick={onToggleExpanded}
        >
          Show {hiddenCount} more
          <ChevronDown className="ml-1 h-3 w-3" />
        </Button>
      )}
      {expanded && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground h-6.5 w-full text-[11px]"
          onClick={onToggleExpanded}
        >
          Show less
          <ChevronDown className="ml-1 h-3 w-3 rotate-180" />
        </Button>
      )}
      <div className="pt-0.5">
        <div className="text-muted-foreground mb-1 text-[9px] font-semibold tracking-wider uppercase">
          Legend
        </div>
        <div className="text-muted-foreground grid grid-cols-2 gap-1 text-[10px]">
          {typeFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => onToggleType(filter.key)}
              className={cn(
                "inline-flex items-center gap-1.5 truncate rounded py-0.5 text-left transition",
                state[filter.key] ? "text-foreground font-medium" : "opacity-40"
              )}
            >
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", filter.dot)} />
              <span className="truncate">{filter.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
