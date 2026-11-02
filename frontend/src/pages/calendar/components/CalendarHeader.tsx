import React from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/GlassCard";
import { toneOutlineClass, toneSurfaceClass } from "@/components/ui/tone";
import { WorkspaceSelector } from "@/components/calendar/WorkspaceSelector";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
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
}

const VIEW_MODES = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "timeline", label: "Timeline" },
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
}) => (
  <header className="pt-1.5 pb-3" aria-label="Calendar controls">
    {/* Wraps by available width: the app sidebar eats viewport width, so a viewport breakpoint cannot decide the rows. */}
    <GlassCard className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b-0 p-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <WorkspaceSelector className="max-w-xs shrink-0 sm:max-w-none" />
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
        <h1 className="shrink-0 text-base font-semibold tracking-tight 2xl:text-xl">
          {format(currentMonth, "MMMM yyyy")}
        </h1>
        {conflictCount !== undefined && conflictCount > 0 && onOpenConflictsModal ? (
          <Button
            variant="outline"
            size="control-sm"
            onClick={onOpenConflictsModal}
            className={cn(
              "shrink-0 gap-1.5 text-xs font-bold whitespace-nowrap",
              toneOutlineClass.warning
            )}
            title={`${conflictCount} team coverage conflicts detected this month`}
            aria-label={`${conflictCount} team conflicts`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>{conflictCount} Conflicts</span>
          </Button>
        ) : (
          <div
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
              toneSurfaceClass.success
            )}
            title="All days have adequate staffing coverage this month"
          >
            <Check className="h-3.5 w-3.5" />
            <span>Full Staffing</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="control"
          variant="default"
          className="order-1 shrink-0 rounded-xl px-3 text-sm sm:order-none"
          onClick={onRequestTimeOff}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Request Time Off
        </Button>

        <div
          className="border-border/60 bg-muted/40 order-3 flex shrink-0 rounded-xl border p-0.5 sm:order-none"
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

        {onToggleDensity && (
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleDensity}
            className={cn(
              actionButtonClass,
              "order-4 gap-1.5 text-xs font-medium sm:order-none",
              density === "compact" && "border-primary/50 bg-primary/10 text-primary"
            )}
            title={density === "compact" ? "Switch to Normal density" : "Switch to Compact density"}
            aria-label="Toggle calendar density"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{density === "compact" ? "Compact" : "Normal"}</span>
          </Button>
        )}

        <Button
          size="sm"
          variant="ghost"
          className={cn(actionButtonClass, "order-2 sm:order-none")}
          onClick={() => exportToCSV(events, `calendar-${currentBusinessDateISO()}`)}
          aria-label="Export calendar as CSV"
          title="Export CSV"
        >
          <FileSpreadsheet className="h-4 w-4 2xl:mr-2" />
          <span className="hidden 2xl:inline">CSV</span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className={cn(actionButtonClass, "order-2 sm:order-none")}
          onClick={() => exportToICal(events, `calendar-${currentBusinessDateISO()}`)}
          aria-label="Export calendar as iCal"
          title="Export iCal"
        >
          <CalendarDays className="h-4 w-4 2xl:mr-2" />
          <span className="hidden 2xl:inline">iCal</span>
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className={cn(iconButtonClass, "order-5 hidden sm:order-none sm:inline-flex")}
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className={cn(iconButtonClass, "order-5 hidden sm:order-none sm:inline-flex")}
          onClick={onClearWorkspaceSelection}
          disabled={!selectedWorkspaceIds.length}
          aria-label="Clear workspace selection"
          title="Clear workspace selection"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
    </GlassCard>
  </header>
);
