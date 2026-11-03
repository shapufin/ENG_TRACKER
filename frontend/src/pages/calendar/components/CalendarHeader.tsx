import React, { useState } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toneOutlineClass, toneSurfaceClass } from "@/components/ui/tone";
import { WorkspaceSelector } from "@/components/calendar/WorkspaceSelector";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Maximize2,
  Minimize2,
  Plus,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { currentBusinessDateISO } from "@/lib/date-format-utils";
import { exportToCSV, exportToICal } from "@/lib/calendar-export";
import type { CalendarEvent, CalendarViewMode, CalendarDensity } from "@/components/calendar/types";

interface CalendarHeaderProps {
  currentMonth: Date;
  viewMode: CalendarViewMode;
  isFullscreen: boolean;
  selectedWorkspaceIds: number[];
  events: CalendarEvent[];
  density?: CalendarDensity;
  conflictCount?: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  onSetViewMode: (mode: CalendarViewMode) => void;
  onToggleDensity?: () => void;
  onOpenConflictsModal?: () => void;
  onToggleFullscreen: () => void;
  onClearWorkspaceSelection: () => void;
  onRequestTimeOff: () => void;
  /** Rendered first in the toolbar row (the sub-xl Filters button), so it costs no extra row. */
  leading?: React.ReactNode;
}

const VIEW_MODES = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "timeline", label: "Timeline" },
  { value: "list", label: "List" },
] as const;

/**
 * A flat toolbar, not a card: the calendar is full-bleed and the month grid
 * needs every pixel of height it can get. Controls come from the control kit
 * (`control-sm` / `control-icon-sm`), so no height is hand-written here.
 */
export const CalendarHeader: React.FC<CalendarHeaderProps> = ({
  currentMonth,
  viewMode,
  isFullscreen,
  selectedWorkspaceIds,
  events,
  density = "normal",
  conflictCount,
  onPrevMonth,
  onNextMonth,
  onToday,
  onSetViewMode,
  onToggleDensity,
  onOpenConflictsModal,
  onToggleFullscreen,
  onClearWorkspaceSelection,
  onRequestTimeOff,
  leading,
}) => {
  const [exportOpen, setExportOpen] = useState(false);
  const hasConflicts = conflictCount !== undefined && conflictCount > 0 && !!onOpenConflictsModal;

  const runExport = (kind: "csv" | "ical") => {
    setExportOpen(false);
    const filename = `calendar-${currentBusinessDateISO()}`;
    if (kind === "csv") exportToCSV(events, filename);
    else exportToICal(events, filename);
  };

  return (
    <header
      className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-2 py-1.5"
      aria-label="Calendar controls"
    >
      {leading}
      <WorkspaceSelector className="max-w-[16rem] shrink-0" />

      <div className="flex shrink-0 items-center">
        <Button
          size="control-icon-sm"
          variant="ghost"
          onClick={onPrevMonth}
          aria-label="Previous month"
          title="Previous month"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button size="control-sm" variant="ghost" onClick={onToday} title="Jump to today">
          Today
        </Button>
        <Button
          size="control-icon-sm"
          variant="ghost"
          onClick={onNextMonth}
          aria-label="Next month"
          title="Next month"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <h1 className="shrink-0 text-sm font-semibold tracking-tight 2xl:text-base">
        <span className="hidden sm:inline">{format(currentMonth, "MMMM yyyy")}</span>
        <span className="sm:hidden">{format(currentMonth, "MMM yyyy")}</span>
      </h1>

      {hasConflicts ? (
        <Button
          variant="outline"
          size="control-sm"
          onClick={onOpenConflictsModal}
          className={cn("shrink-0 gap-1.5 text-xs font-semibold", toneOutlineClass.warning)}
          title={`${conflictCount} team coverage conflicts detected this month`}
          aria-label={`${conflictCount} team conflicts`}
        >
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{conflictCount}</span>
        </Button>
      ) : (
        <div
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold whitespace-nowrap",
            toneSurfaceClass.success
          )}
          title="All days have adequate staffing coverage this month"
          aria-label="Full staffing coverage"
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden lg:inline">Full Staffing</span>
        </div>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-1">
        <div
          className="border-border/60 bg-muted/40 flex shrink-0 rounded-lg border p-0.5"
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
                "rounded-md px-2 py-1 text-xs font-medium transition",
                viewMode === view.value
                  ? "bg-background text-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {view.label}
            </button>
          ))}
        </div>

        {onToggleDensity && (
          <Button
            variant="ghost"
            size="control-icon-sm"
            onClick={onToggleDensity}
            className={cn(density === "compact" && "text-primary bg-primary/10")}
            title={density === "compact" ? "Switch to Normal density" : "Switch to Compact density"}
            aria-label="Toggle calendar density"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}

        <Popover open={exportOpen} onOpenChange={setExportOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="control-icon-sm"
              aria-label="Export calendar"
              title="Export calendar"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44 p-1">
            <button
              type="button"
              onClick={() => runExport("csv")}
              className="hover:bg-muted focus-visible:ring-ring flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium focus:outline-none focus-visible:ring-1"
              aria-label="Export calendar as CSV"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
              CSV
            </button>
            <button
              type="button"
              onClick={() => runExport("ical")}
              className="hover:bg-muted focus-visible:ring-ring flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium focus:outline-none focus-visible:ring-1"
              aria-label="Export calendar as iCal"
            >
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              iCal
            </button>
          </PopoverContent>
        </Popover>

        <Button
          size="control-icon-sm"
          variant="ghost"
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? (
            <Minimize2 className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
        <Button
          size="control-icon-sm"
          variant="ghost"
          className="hidden sm:inline-flex"
          onClick={onClearWorkspaceSelection}
          disabled={!selectedWorkspaceIds.length}
          aria-label="Clear workspace selection"
          title="Clear workspace selection"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
        </Button>

        <Button
          size="control-sm"
          variant="default"
          className="shrink-0 text-xs font-semibold"
          onClick={onRequestTimeOff}
        >
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Request time off</span>
          <span className="sm:hidden">Request</span>
        </Button>
      </div>
    </header>
  );
};
