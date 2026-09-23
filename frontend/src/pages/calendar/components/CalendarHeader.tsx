import React from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/GlassCard";
import { WorkspaceSelector } from "@/components/calendar/WorkspaceSelector";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  Minimize2,
  Plus,
  RotateCcw,
} from "lucide-react";
import { exportToCSV, exportToICal } from "@/lib/calendar-export";
import type { CalendarEvent } from "@/components/calendar/types";

interface CalendarHeaderProps {
  currentMonth: Date;
  viewMode: "month" | "week" | "list";
  isFullscreen: boolean;
  selectedWorkspaceIds: number[];
  events: CalendarEvent[];
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  onSetViewMode: (mode: "month" | "week" | "list") => void;
  onToggleFullscreen: () => void;
  onClearWorkspaceSelection: () => void;
  onRequestTimeOff: () => void;
}

const VIEW_MODES = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "list", label: "List" },
] as const;

const iconButtonClass =
  "h-11 w-11 shrink-0 rounded-xl border border-border/60 bg-background/50 text-foreground hover:bg-muted md:h-9 md:w-9";
const actionButtonClass =
  "h-11 shrink-0 rounded-xl border border-border/60 bg-background/50 px-2.5 text-foreground hover:bg-muted md:h-9";

export const CalendarHeader: React.FC<CalendarHeaderProps> = ({
  currentMonth,
  viewMode,
  isFullscreen,
  selectedWorkspaceIds,
  events,
  onPrevMonth,
  onNextMonth,
  onToday,
  onSetViewMode,
  onToggleFullscreen,
  onClearWorkspaceSelection,
  onRequestTimeOff,
}) => (
  <header className="pb-3 pt-1.5" aria-label="Calendar controls">
    <GlassCard
      isHoverLift={false}
      className="flex flex-wrap items-center gap-2 border-b-0 p-3 min-[1440px]:flex-nowrap min-[1440px]:justify-between"
    >
      <WorkspaceSelector className="w-full max-w-xs shrink-0 sm:w-auto sm:max-w-none" />
      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          className={iconButtonClass}
          onClick={onPrevMonth}
          aria-label="Previous month"
          title="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          className={actionButtonClass}
          onClick={onToday}
          title="Jump to today"
        >
          Today
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className={iconButtonClass}
          onClick={onNextMonth}
          aria-label="Next month"
          title="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <h1 className="w-full shrink-0 text-base font-semibold tracking-tight sm:w-auto 2xl:text-xl">
        {format(currentMonth, "MMMM yyyy")}
      </h1>
      <div className="hidden basis-full sm:block min-[1440px]:hidden" aria-hidden="true" />
      <Button
        size="sm"
        variant="default"
        className="h-9 shrink-0 rounded-xl px-3 text-[13px] min-[1440px]:ml-auto"
        onClick={onRequestTimeOff}
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Request Time Off
      </Button>

      <div
        className="flex shrink-0 rounded-xl border border-border/60 bg-muted/40 p-0.5"
        role="group"
        aria-label="Calendar view"
      >
        {VIEW_MODES.map((view) => (
          <button
            key={view.value}
            type="button"
            aria-pressed={viewMode === view.value}
            onClick={() => onSetViewMode(view.value)}
            className={cn(
              "rounded-lg px-2.5 py-2 text-xs font-medium transition md:py-1.5",
              viewMode === view.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {view.label}
          </button>
        ))}
      </div>

      <Button
        size="sm"
        variant="ghost"
        className={actionButtonClass}
        onClick={() => exportToCSV(events, `calendar-${format(new Date(), "yyyy-MM-dd")}`)}
        aria-label="Export calendar as CSV"
        title="Export CSV"
      >
        <Download className="h-4 w-4 2xl:mr-2" />
        <span className="hidden 2xl:inline">CSV</span>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className={actionButtonClass}
        onClick={() => exportToICal(events, `calendar-${format(new Date(), "yyyy-MM-dd")}`)}
        aria-label="Export calendar as iCal"
        title="Export iCal"
      >
        <Download className="h-4 w-4 2xl:mr-2" />
        <span className="hidden 2xl:inline">iCal</span>
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className={iconButtonClass}
        onClick={onToggleFullscreen}
        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      >
        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className={iconButtonClass}
        onClick={onClearWorkspaceSelection}
        disabled={!selectedWorkspaceIds.length}
        aria-label="Clear workspace selection"
        title="Clear workspace selection"
      >
        <RotateCcw className="h-4 w-4" />
      </Button>
    </GlassCard>
  </header>
);
