import React, { useState } from "react";
import { X } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { CalendarSidebar } from "@/components/calendar/CalendarSidebar";
import { CalendarSnapshotCard } from "@/components/calendar/CalendarSnapshotCard";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { User } from "@/types";
import { CalendarHeader } from "./CalendarHeader";
import { CalendarBottomCards } from "./CalendarBottomCards";
import { CalendarPageMain } from "./CalendarPageMain";
import { CalendarPageModals } from "./CalendarPageModals";
import type { useCalendarPageData } from "../hooks/useCalendarPageData";

type CalendarData = ReturnType<typeof useCalendarPageData>;

interface CalendarPageShellProps {
  user: User | null;
  canViewTeamData: boolean;
  selectedWorkspaceIds: number[];
  data: CalendarData;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  onSetViewMode: (mode: "month" | "week" | "list") => void;
}

export const CalendarPageShell: React.FC<CalendarPageShellProps> = ({
  user,
  canViewTeamData,
  selectedWorkspaceIds,
  data,
  onPrevMonth,
  onNextMonth,
  onToday,
  onSetViewMode,
}) => {
  const isMobile = useIsMobile();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const showMobileSidebar = isMobile && mobileSidebarOpen;

  const sidebar = (
    <CalendarSidebar
      allUsers={data.allUsers}
      visibleUsers={data.visibleUsers}
      onToggleUser={data.toggleUser}
      onClearUsers={data.handleResetVisibleUsers}
      showStandby={data.showStandby}
      showVacation={data.showVacation}
      showSick={data.showSick}
      onToggleType={data.toggleEventType}
      onShowUserModal={data.handleUserClick}
      collapsed={data.isSidebarCollapsed}
      onToggleCollapse={data.handleSidebarToggle}
      groupedUsers={data.groupedUsersWithNames}
      remainingDaysByUser={data.memberRemainingDays}
    />
  );

  return (
    <div
      className={cn(
        "min-h-screen bg-background font-sans text-foreground antialiased selection:bg-primary/30 selection:text-primary-foreground",
        data.isFullscreen && "fixed inset-0 z-50 overflow-y-auto"
      )}
    >
      <CalendarHeader
        currentMonth={data.currentMonth}
        viewMode={data.viewMode}
        isFullscreen={data.isFullscreen}
        selectedWorkspaceIds={selectedWorkspaceIds}
        events={data.events}
        onPrevMonth={onPrevMonth}
        onNextMonth={onNextMonth}
        onToday={onToday}
        onSetViewMode={onSetViewMode}
        onToggleFullscreen={data.handleToggleFullscreen}
        onClearWorkspaceSelection={data.handleClearWorkspaceSelection}
      />

      {isMobile && (
        <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-border/60 bg-background/50 px-3 text-sm font-medium text-foreground hover:bg-muted"
            aria-label="Open filters"
            aria-expanded={mobileSidebarOpen}
            aria-controls="calendar-mobile-sidebar"
          >
            Filters
          </button>
        </div>
      )}

      <div
        className={cn(
          "grid flex-1 gap-2.5 overflow-hidden transition-all duration-300 ease-out",
          data.isSidebarCollapsed
            ? "xl:grid-cols-[110px_minmax(0,1fr)]"
            : "xl:grid-cols-[200px_minmax(0,1fr)]"
        )}
      >
        {!isMobile && (
          <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
            {sidebar}
            {!data.isSidebarCollapsed && (
              <CalendarSnapshotCard summary={data.vacationSummary} formatDays={data.formatDays} />
            )}
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          {data.workspaceUsersPartial && (
            <GlassCard
              isHoverLift={false}
              role="status"
              aria-label="Partial workspace data warning"
              className="border-warning/40 bg-warning/10 px-3 py-2"
            >
              <div className="text-xs text-foreground">
                Some workspace members could not be loaded. The calendar may be incomplete.
              </div>
            </GlassCard>
          )}
          <CalendarPageMain data={data} />
          <CalendarBottomCards
            vacationSummary={data.vacationSummary}
            carryOverAndBalance={data.carryOverAndBalance}
            metricBars={data.metricBars}
            conflictEntries={data.conflictEntries}
            formatDays={data.formatDays}
            onViewAllConflicts={() => data.setConflictsModalOpen(true)}
          />
        </div>
      </div>

      {showMobileSidebar && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden="true"
          />
          <div
            id="calendar-mobile-sidebar"
            className="fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] flex-col bg-card shadow-xl"
            role="dialog"
            aria-label="Calendar filters"
          >
            <div className="flex items-center justify-between border-b border-border/60 p-3">
              <h2 className="text-sm font-semibold">Filters</h2>
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-accent"
                aria-label="Close filters"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{sidebar}</div>
          </div>
        </>
      )}

      <CalendarPageModals user={user} canViewTeamData={canViewTeamData} data={data} />
    </div>
  );
};
