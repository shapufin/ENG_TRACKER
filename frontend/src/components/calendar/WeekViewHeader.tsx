import React from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface WeekViewHeaderProps {
  weekLabel: string;
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
}

export const WeekViewHeader: React.FC<WeekViewHeaderProps> = ({
  weekLabel,
  onPrevWeek,
  onNextWeek,
}) => (
  <div className="flex items-center justify-between border-b border-border/70 bg-muted/20 px-4 py-3">
    <div className="flex items-center gap-2">
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 rounded-lg border border-border/70 bg-background/60 text-foreground hover:bg-muted"
        onClick={onPrevWeek}
        aria-label="Previous week"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <h2 className="text-lg font-semibold text-foreground">{weekLabel}</h2>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 rounded-lg border border-border/70 bg-background/60 text-foreground hover:bg-muted"
        onClick={onNextWeek}
        aria-label="Next week"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
      Team Members
    </p>
  </div>
);
