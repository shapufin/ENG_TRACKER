import React from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CalendarSidebarFooterProps {
  hiddenCount: number;
  expanded: boolean;
  onToggleExpanded: () => void;
  showStandby?: boolean;
  showVacation?: boolean;
  showSick?: boolean;
  onToggleType?: (type: "standby" | "vacation" | "sick") => void;
}

export const CalendarSidebarFooter: React.FC<CalendarSidebarFooterProps> = ({
  hiddenCount,
  expanded,
  onToggleExpanded,
}) => {
  if (hiddenCount === 0 && !expanded) return null;

  return (
    <div className="border-border/60 border-t p-1.5">
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
    </div>
  );
};
