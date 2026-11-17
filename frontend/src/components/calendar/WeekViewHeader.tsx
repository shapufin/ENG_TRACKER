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
  <div className="border-border/70 bg-muted/20 flex items-center justify-between border-b px-4 py-3">
    <div className="flex items-center gap-2">
      <Button
        size="icon"
        variant="ghost"
        className="border-border/70 bg-background/60 text-foreground hover:bg-muted h-8 w-8 rounded-lg border"
        onClick={onPrevWeek}
        aria-label="Previous week"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <h2 className="text-foreground text-lg font-semibold">{weekLabel}</h2>
      <Button
        size="icon"
        variant="ghost"
        className="border-border/70 bg-background/60 text-foreground hover:bg-muted h-8 w-8 rounded-lg border"
        onClick={onNextWeek}
        aria-label="Next week"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
    <p className="text-muted-foreground text-xs font-semibold tracking-[0.3em] uppercase">
      Team Members
    </p>
  </div>
);
