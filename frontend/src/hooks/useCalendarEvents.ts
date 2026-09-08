import { useMemo } from "react";
import { useCalendarEventQueries } from "./useCalendarEventQueries";
import { useCalendarEventFilters } from "./useCalendarEventFilters";
import { buildCalendarEvents } from "@/lib/calendarEvents";
import type { User } from "@/types";

interface UseCalendarEventsOptions {
  workspaceScope: string;
  hasWorkspaceSelection: boolean;
  canViewTeamData: boolean;
  canFetchCalendarData: boolean;
  allUsers: User[];
  visibleUsers: Set<number>;
  showFilters: boolean;
}

interface UseCalendarEventsReturn {
  events: import("@/components/calendar/types").CalendarEvent[];
  isLoading: boolean;
  hasError: boolean;
  showStandby: boolean;
  showVacation: boolean;
  showSick: boolean;
  setShowStandby: (value: boolean) => void;
  setShowVacation: (value: boolean) => void;
  setShowSick: (value: boolean) => void;
  toggleEventType: (type: "standby" | "vacation" | "sick") => void;
  resetFilters: () => void;
  hiddenFilterCount: number;
  refetch: () => void;
  holidayData: import("@/types").PublicHoliday[] | undefined;
}

export const useCalendarEvents = ({
  workspaceScope,
  hasWorkspaceSelection,
  canFetchCalendarData,
  allUsers,
  visibleUsers,
  showFilters,
}: UseCalendarEventsOptions): UseCalendarEventsReturn => {
  const {
    showStandby,
    setShowStandby,
    showVacation,
    setShowVacation,
    showSick,
    setShowSick,
    toggleEventType,
    resetFilters,
    hiddenFilterCount,
  } = useCalendarEventFilters();

  const { standbyData, leaveRequestsData, holidayData, isLoading, hasError, refetch } =
    useCalendarEventQueries({
      workspaceScope,
      hasWorkspaceSelection,
      canFetchCalendarData,
      showStandby,
    });

  const events = useMemo(
    () =>
      buildCalendarEvents(
        standbyData?.results,
        leaveRequestsData?.results,
        holidayData,
        allUsers,
        { showStandby, showVacation, showSick, showFilters, visibleUsers },
        hasWorkspaceSelection
      ),
    [
      standbyData,
      leaveRequestsData,
      holidayData,
      allUsers,
      showStandby,
      showVacation,
      showSick,
      showFilters,
      visibleUsers,
      hasWorkspaceSelection,
    ]
  );

  return {
    events,
    isLoading,
    hasError,
    showStandby,
    showVacation,
    showSick,
    setShowStandby,
    setShowVacation,
    setShowSick,
    toggleEventType,
    resetFilters,
    hiddenFilterCount,
    refetch,
    holidayData,
  };
};
