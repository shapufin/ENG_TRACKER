import React, { useEffect, useRef } from "react";
import { addDays, subDays, addWeeks, subWeeks, addMonths, subMonths } from "date-fns";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/context/PermissionContext";
import { useCalendarWorkspace } from "@/context/CalendarWorkspaceContext";
import { useValidWorkspaceIds } from "@/hooks/useValidWorkspaceIds";
import { useQueryClient } from "@tanstack/react-query";
import { WorkspaceSelector } from "@/components/calendar/WorkspaceSelector";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { GlassCard } from "@/components/ui/GlassCard";
import { CalendarDays } from "lucide-react";
import { useCalendarPageData } from "./hooks/useCalendarPageData";
import { CalendarPageShell } from "./components/CalendarPageShell";
import { shouldIgnoreCalendarKey } from "./hooks/shouldIgnoreCalendarKey";

const CalendarPageContent: React.FC = () => {
  const { setSelectedWorkspaces, isMultiSelect } = useCalendarWorkspace();
  const { validIds } = useValidWorkspaceIds();
  const { canViewWorkspaceMembers, canViewTeamData } = usePermissions();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Use synchronously-validated IDs so stale localStorage values never
  // reach API calls. useWorkspaceInit handles pruning localStorage in a
  // post-render effect; useValidWorkspaceIds prevents the race.
  const effectiveWorkspaceIds = isMultiSelect ? validIds : validIds.slice(0, 1);

  const data = useCalendarPageData(
    user,
    canViewTeamData,
    canViewWorkspaceMembers,
    effectiveWorkspaceIds,
    setSelectedWorkspaces,
    isMultiSelect
  );

  // The listener is attached once; the ref hands it the latest data without re-binding every render.
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (shouldIgnoreCalendarKey(e)) return;
      const { currentMonth, setCurrentMonth } = dataRef.current;
      const navMap: Record<string, () => Date> = {
        ArrowLeft: () => subDays(currentMonth, 1),
        ArrowRight: () => addDays(currentMonth, 1),
        ArrowUp: () => subWeeks(currentMonth, 1),
        ArrowDown: () => addWeeks(currentMonth, 1),
      };
      if (navMap[e.key]) {
        e.preventDefault();
        setCurrentMonth(navMap[e.key]());
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handlePrevMonth = () => data.setCurrentMonth((prev: Date) => subMonths(prev, 1));
  const handleNextMonth = () => data.setCurrentMonth((prev: Date) => addMonths(prev, 1));
  const handleToday = () => data.setCurrentMonth(new Date());
  const handleSetViewMode = (mode: "month" | "week" | "list") => data.setViewMode(mode);

  if (!data.hasWorkspaceSelection) {
    return (
      <GlassCard className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <EmptyState
          icon={CalendarDays}
          title="Select a workspace to view the calendar"
          description="Workspaces scope the calendar to your teams. Choose one (or multiple) to load events, balances, and filters."
          action={<WorkspaceSelector className="w-full max-w-xs justify-center" />}
        />
      </GlassCard>
    );
  }

  if (data.isLoading) {
    return <LoadingCard title="Loading calendar..." rows={6} className="mx-auto max-w-lg" />;
  }

  if (data.hasError) {
    return (
      <ErrorCard
        title="Failed to load calendar"
        message="Could not fetch calendar data. Please check your connection or log in again."
        onRetry={() => {
          queryClient.invalidateQueries({ queryKey: ["standby", "calendar"] });
          queryClient.invalidateQueries({ queryKey: ["vacations", "calendar"] });
          queryClient.invalidateQueries({ queryKey: ["holidays", "calendar"] });
        }}
      />
    );
  }

  return (
    <CalendarPageShell
      user={user}
      canViewTeamData={canViewTeamData}
      selectedWorkspaceIds={effectiveWorkspaceIds}
      data={data}
      onPrevMonth={handlePrevMonth}
      onNextMonth={handleNextMonth}
      onToday={handleToday}
      onSetViewMode={handleSetViewMode}
    />
  );
};

export const CalendarPage: React.FC = () => <CalendarPageContent />;

export default CalendarPage;
