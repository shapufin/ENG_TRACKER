import React, { useState } from "react";
import { X } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { CalendarSidebar } from "@/components/calendar/CalendarSidebar";
import { cn } from "@/lib/utils";
import { useIsBelowXl } from "@/hooks/useIsBelowXl";
import type { User } from "@/types";
import type { CalendarViewMode } from "@/components/calendar/types";
import { CalendarHeader } from "./CalendarHeader";
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
  onSetViewMode: (mode: CalendarViewMode) => void;
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
  const isMobile = useIsBelowXl();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const showMobileSidebar = isMobile && mobileSidebarOpen;

  const sidebar = (
    <CalendarSidebar
      allUsers={data.allUsers}
      visibleUsers={data.visibleUsers}
      onToggleUser={data.toggleUser}
      onClearUsers={data.handleResetVisibleUsers}
      onSetUsers={data.setVisibleUserIds}
      showStandby={data.showStandby}
      showVacation={data.showVacation}
      showSick={data.showSick}
      onToggleType={data.toggleEventType}
      onShowUserModal={data.handleUserClick}
      collapsed={data.isSidebarCollapsed}
      onToggleCollapse={data.handleSidebarToggle}
      groupedUsers={data.groupedUsersWithNames}
      remainingDaysByUser={data.memberRemainingDays}
      snapshotSummary={data.vacationSummary}
      formatDays={data.formatDays}
      onShowSnapshotModal={() => user && data.handleUserClick(user.id)}
    />
  );

  return (
    <div
      className={cn(
        "bg-background text-foreground selection:bg-primary/30 selection:text-primary-foreground min-h-screen font-sans antialiased",
        data.isFullscreen && "fixed inset-0 z-50 overflow-y-auto"
      )}
    >
      <CalendarHeader
        currentMonth={data.currentMonth}
        viewMode={data.viewMode}
        isFullscreen={data.isFullscreen}
        selectedWorkspaceIds={selectedWorkspaceIds}
        events={data.events}
        density={data.density}
        conflictCount={data.conflictEntries?.length || 0}
        onPrevMonth={onPrevMonth}
        onNextMonth={onNextMonth}
        onToday={onToday}
        onSetViewMode={onSetViewMode}
        onToggleDensity={() => data.setDensity(data.density === "compact" ? "normal" : "compact")}
        onOpenConflictsModal={() => data.setConflictsModalOpen(true)}
        onToggleFullscreen={data.handleToggleFullscreen}
        onClearWorkspaceSelection={data.handleClearWorkspaceSelection}
        onRequestTimeOff={data.openBookingDialog}
      />

      {isMobile && (
        <div className="border-border/60 flex items-center gap-2 border-b px-3 py-2">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="border-border/60 bg-background/50 text-foreground hover:bg-muted inline-flex h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium"
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
          "grid flex-1 gap-3 overflow-hidden transition-all duration-300 ease-out",
          data.isSidebarCollapsed
            ? "xl:grid-cols-[48px_minmax(0,1fr)]"
            : "xl:grid-cols-[192px_minmax(0,1fr)] 2xl:grid-cols-[224px_minmax(0,1fr)]"
        )}
      >
        {!isMobile && <div className="flex min-h-0 flex-col gap-3 overflow-hidden">{sidebar}</div>}

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          {data.workspaceUsersPartial && (
            <GlassCard
              role="status"
              aria-label="Partial workspace data warning"
              className="border-warning/40 bg-warning/10 px-3 py-2"
            >
              <div className="text-foreground text-xs">
                Some workspace members could not be loaded. The calendar may be incomplete.
              </div>
            </GlassCard>
          )}
          {data.eventsTruncated && (
            <GlassCard
              role="status"
              aria-label="Truncated events warning"
              className="border-warning/40 bg-warning/10 px-3 py-2"
            >
              <div className="text-foreground text-xs">
                There are more vacation or standby entries than the calendar can load, so some are
                missing. Narrow the selected teams to see everything.
              </div>
            </GlassCard>
          )}
          <CalendarPageMain data={data} />
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
            className="bg-card fixed inset-y-0 left-0 z-50 flex w-70 max-w-[85vw] flex-col shadow-xl"
            role="dialog"
            aria-label="Calendar filters"
          >
            <div className="border-border/60 flex items-center justify-between border-b p-3">
              <h2 className="text-sm font-semibold">Filters</h2>
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className="hover:bg-accent flex h-11 w-11 items-center justify-center rounded-md"
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
