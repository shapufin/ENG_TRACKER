import { useState, useMemo, useCallback } from "react";
import { parseISO, format } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { leaveService } from "@/services/leaveService";
import type { LeaveRequest, LeaveBalance, User } from "@/types";
import { handleApiError } from "@/lib/error-handler";
import { businessToday } from "@/lib/date-format-utils";
import { toast } from "sonner";
import { deriveFullName } from "@/lib/user-utils";
import { deriveVacationBalanceFromBalances } from "@/lib/vacation-balance";

import { buildMetricBars, computeCarryOverAndBalance, formatDays } from "@/lib/calendarPageMetrics";
import { buildDayConflicts, conflictEntriesForMonth } from "@/lib/calendarCoverage";
import { useCalendarQueries } from "@/hooks/useCalendarQueries";
import { useCalendarEvents } from "@/hooks/useCalendarEvents";
import { useUserVisibility } from "@/hooks/useUserVisibility";
import { useRangeSelection } from "@/hooks/useRangeSelection";
import { useWorkspaceData } from "@/components/calendar/hooks/useWorkspaceData";
import type { CalendarSidebarLayer } from "@/components/calendar/CalendarSidebarLayers";
import { buildWorkspaceLayers } from "./buildWorkspaceLayers";
import type { CalendarViewMode, CalendarDensity, CalendarEvent } from "@/components/calendar/types";

// fallow-ignore-next-line complexity
export const useCalendarPageData = (
  user: User | null,
  canViewTeamData: boolean,
  canViewWorkspaceMembers: boolean,
  selectedWorkspaceIds: number[],
  setSelectedWorkspaces: (ids: number[]) => void,
  isMultiSelect: boolean
) => {
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(() => businessToday());
  const [viewMode, setViewMode] = useState<CalendarViewMode>(() => {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      return window.matchMedia("(max-width: 767px)").matches ? "list" : "month";
    }
    return "month";
  });
  const [density, setDensityState] = useState<CalendarDensity>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("calendar_density");
        if (stored === "compact" || stored === "normal") return stored;
      } catch {
        // Ignore localStorage access errors (e.g. private browsing)
      }
    }
    return "normal";
  });
  const setDensity = useCallback((d: CalendarDensity) => {
    setDensityState(d);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("calendar_density", d);
      } catch {
        // Ignore localStorage access errors
      }
    }
  }, []);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [requestType, setRequestType] = useState<LeaveRequest["request_type"]>("vacation");
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [selectedUserForModal, setSelectedUserForModal] = useState<User | null>(null);
  const [actionModalEvent, setActionModalEvent] = useState<
    import("@/components/calendar/types").CalendarEvent | null
  >(null);
  const [conflictsModalOpen, setConflictsModalOpen] = useState(false);
  const [dayEventsDate, setDayEventsDate] = useState<Date | null>(null);

  const effectiveWorkspaceIds = useMemo(
    () => (isMultiSelect ? selectedWorkspaceIds : selectedWorkspaceIds.slice(0, 1)),
    [isMultiSelect, selectedWorkspaceIds]
  );
  const hasWorkspaceSelection = effectiveWorkspaceIds.length > 0;
  const workspaceScope = useMemo(() => effectiveWorkspaceIds.join(","), [effectiveWorkspaceIds]);
  const canViewTeamBalances =
    canViewWorkspaceMembers && hasWorkspaceSelection && workspaceScope.length > 0;
  const canFetchCalendarData = canViewTeamData || hasWorkspaceSelection;

  const {
    normalizedWorkspaceUsers,
    groupedWorkspaceUsers,
    workspaceUsersPartial,
    balancesData,
    teamBalancesData,
    isLoading: queriesLoading,
  } = useCalendarQueries({
    userId: user?.id,
    selectedWorkspaceIds: effectiveWorkspaceIds,
    workspaceScope,
    canViewTeamBalances,
  });

  const { data: workspacesData } = useWorkspaceData();

  const workspaceNameById = useMemo(() => {
    const map = new Map<number, string>();
    workspacesData?.forEach((ws) => map.set(ws.id, ws.name));
    return map;
  }, [workspacesData]);

  const groupedUsersWithNames = useMemo(() => {
    return groupedWorkspaceUsers.map((group) => ({
      ...group,
      workspaceName: workspaceNameById.get(group.workspaceId) || `Workspace ${group.workspaceId}`,
    }));
  }, [groupedWorkspaceUsers, workspaceNameById]);

  /**
   * The sidebar's Team Layers. Selecting a layer is the same action as picking a
   * workspace in the header selector, so this is the only place the two stay in
   * sync — the roster endpoint only returns members for *selected* workspaces,
   * which is why a count is absent until that layer is on.
   */
  const workspaceLayers = useMemo<CalendarSidebarLayer[]>(() => {
    const countByWorkspace = new Map<number, number>();
    groupedWorkspaceUsers.forEach((group) =>
      countByWorkspace.set(group.workspaceId, group.users.length)
    );
    return buildWorkspaceLayers(workspacesData ?? [], countByWorkspace, effectiveWorkspaceIds);
  }, [workspacesData, groupedWorkspaceUsers, effectiveWorkspaceIds]);

  const allUsers = useMemo(() => {
    if (!hasWorkspaceSelection) return [] as User[];
    if (normalizedWorkspaceUsers.length > 0) return normalizedWorkspaceUsers;
    if (user) {
      return [{ ...user, full_name: deriveFullName(user) } as User];
    }
    return [] as User[];
  }, [hasWorkspaceSelection, normalizedWorkspaceUsers, user]);

  const {
    visibleUsers,
    isSidebarCollapsed,
    handleSidebarToggle,
    toggleUser,
    handleResetVisibleUsers,
    setVisibleUserIds,
  } = useUserVisibility({ allUsers });

  const {
    events,
    isLoading: eventsLoading,
    hasError: eventsError,
    eventsTruncated,
    leaveRequests,
    showStandby,
    showVacation,
    showSick,
    toggleEventType,
    holidayData,
  } = useCalendarEvents({
    workspaceScope,
    hasWorkspaceSelection,
    canViewTeamData,
    canFetchCalendarData,
    allUsers,
    visibleUsers,
    showFilters: canViewTeamData,
  });

  const {
    rangeStart,
    rangeEnd,
    isDraggingRange,
    selectedDate,
    selectedDates,
    handleRangeStart,
    handleRangeMove,
    finalizeRangeSelection,
    handleSelectDate,
    applyRangeSelection,
  } = useRangeSelection({ onRangeSelected: () => setDialogOpen(true) });

  /** Opens the booking dialog without a pre-dragged grid range (header CTA). */
  const openBookingDialog = useCallback(() => {
    const today = businessToday();
    applyRangeSelection(today, today);
  }, [applyRangeSelection]);

  /** Lets the booking dialog's manual date inputs adjust the same selection
   * the grid-drag path populates, so both entry points share one source of
   * truth. */
  const setDateRange = useCallback(
    (start: string, end: string) => {
      if (!start || !end) return;
      const startDate = parseISO(start);
      const endDate = parseISO(end);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return;
      applyRangeSelection(startDate, endDate, false);
    },
    [applyRangeSelection]
  );

  const isLoading = eventsLoading || queriesLoading;
  const hasError = eventsError;

  const currentBalance = useMemo(() => {
    if (!balancesData) return null;
    return deriveVacationBalanceFromBalances(balancesData);
  }, [balancesData]);

  const teamBalances = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (teamBalancesData ?? []).map((b: any) => ({
      ...b,
      vacation_balance: deriveVacationBalanceFromBalances([b]),
    }));
  }, [teamBalancesData]);

  const memberRemainingDays = useMemo(() => {
    const map = new Map<number, number>();
    teamBalances.forEach((b) => {
      if (!map.has(b.user)) map.set(b.user, b.vacation_balance?.remainingDays ?? 0);
    });
    return map;
  }, [teamBalances]);

  const createRequest = useMutation({
    mutationFn: leaveService.createRequest,
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["vacations", "calendar"] });
      queryClient.refetchQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["vacations", "balances"] });
      queryClient.invalidateQueries({ queryKey: ["vacations", "team-balances"] });
      toast.success("Request created");
      setDialogOpen(false);
      setReason("");
      setRequestType("vacation");
    },
    onError: (err: unknown) => handleApiError(err),
  });

  const handleUserClick = (userId: number) => {
    const userObj = allUsers.find((u: User) => u.id === userId);
    if (userObj) {
      setSelectedUserForModal(userObj);
      setUserModalOpen(true);
    }
  };

  const handleEventActivate = (event: import("@/components/calendar/types").CalendarEvent) => {
    setActionModalEvent(event);
  };

  const handleClearWorkspaceSelection = useCallback(() => {
    setSelectedWorkspaces([]);
    setSelectedUserForModal(null);
    setUserModalOpen(false);
  }, [setSelectedWorkspaces]);

  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  const safeSelectedUser = useMemo(() => {
    if (!selectedUserForModal) return null;
    return allUsers.find((u) => u.id === selectedUserForModal.id) ?? null;
  }, [selectedUserForModal, allUsers]);

  const activeModalUser = hasWorkspaceSelection ? safeSelectedUser : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentUserTeamIds = user?.teams?.map((t: any) => t.id) ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selectedUserTeamIds = activeModalUser?.teams?.map((t: any) => t.id) ?? [];
  const isSameTeam = currentUserTeamIds.some((id: number) => selectedUserTeamIds.includes(id));

  const shouldFetchPersonalBalances =
    !!activeModalUser && userModalOpen && (!canViewTeamBalances || !isSameTeam);
  const { data: personalUserBalances } = useQuery({
    queryKey: ["vacations", "balances", activeModalUser?.id],
    queryFn: () => leaveService.getBalances({ user: activeModalUser?.id }),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: shouldFetchPersonalBalances,
  });

  const selectedUserBalances = useMemo(() => {
    if (!activeModalUser) return [] as LeaveBalance[];
    if (canViewTeamBalances && isSameTeam) {
      return (teamBalancesData ?? []).filter((balance) => balance.user === activeModalUser.id);
    }
    return personalUserBalances ?? [];
  }, [activeModalUser, canViewTeamBalances, isSameTeam, teamBalancesData, personalUserBalances]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDates) return;
    createRequest.mutate({
      request_type: requestType,
      start_date: selectedDates.start,
      end_date: selectedDates.end,
      reason,
    });
  };

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setReason("");
      setRequestType("vacation");
    }
  };

  const balances = useMemo(() => (balancesData ?? []) as LeaveBalance[], [balancesData]);
  const vacationSummary = useMemo(() => deriveVacationBalanceFromBalances(balances), [balances]);
  const carryOverAndBalance = useMemo(() => computeCarryOverAndBalance(balances), [balances]);
  const metricBars = useMemo(() => buildMetricBars(vacationSummary), [vacationSummary]);
  const holidayDates = useMemo(
    () => new Set((holidayData ?? []).map((h) => h.date.slice(0, 10))),
    [holidayData]
  );
  const dayConflicts = useMemo(
    () => buildDayConflicts({ leaves: leaveRequests, groups: groupedUsersWithNames, holidayDates }),
    [leaveRequests, groupedUsersWithNames, holidayDates]
  );
  // One rule feeds the grid badges, the header count, the card and the modal, so they always agree.
  const conflictEntries = useMemo(
    () => conflictEntriesForMonth(dayConflicts, currentMonth),
    [dayConflicts, currentMonth]
  );
  const allConflictEntries = conflictEntries;

  /**
   * "+N more" in a day cell opens the day's full list instead of the booking
   * dialog (the cell click keeps booking). The match rule mirrors the grid's
   * own event map: an entry covers a day when the day falls inside its span.
   */
  const dayEventsKey = dayEventsDate ? format(dayEventsDate, "yyyy-MM-dd") : null;
  const dayEvents = useMemo(
    () =>
      dayEventsKey
        ? events.filter(
            (evt) => evt.start.slice(0, 10) <= dayEventsKey && dayEventsKey <= evt.end.slice(0, 10)
          )
        : ([] as CalendarEvent[]),
    [events, dayEventsKey]
  );
  const dayConflict = useMemo(
    () => (dayEventsKey ? dayConflicts.get(dayEventsKey) : undefined),
    [dayConflicts, dayEventsKey]
  );
  const openDayEvents = useCallback((date: Date) => setDayEventsDate(date), []);
  const handleDayEventsOpenChange = useCallback((open: boolean) => {
    if (!open) setDayEventsDate(null);
  }, []);
  const requestTimeOffForDay = useCallback(
    (date: Date) => applyRangeSelection(date, date),
    [applyRangeSelection]
  );

  return {
    currentMonth,
    setCurrentMonth,
    viewMode,
    setViewMode,
    density,
    setDensity,
    isFullscreen,
    setIsFullscreen,
    dialogOpen,
    setDialogOpen,
    reason,
    setReason,
    requestType,
    setRequestType,
    userModalOpen,
    setUserModalOpen,
    selectedUserForModal,
    setSelectedUserForModal,
    actionModalEvent,
    setActionModalEvent,
    conflictsModalOpen,
    setConflictsModalOpen,
    dayEventsDate,
    dayEvents,
    dayConflict,
    openDayEvents,
    handleDayEventsOpenChange,
    requestTimeOffForDay,
    hasWorkspaceSelection,
    workspaceScope,
    isLoading,
    hasError,
    allUsers,
    visibleUsers,
    isSidebarCollapsed,
    handleSidebarToggle,
    toggleUser,
    handleResetVisibleUsers,
    setVisibleUserIds,
    groupedUsersWithNames,
    workspaceLayers,
    workspaceUsersPartial,
    eventsTruncated,
    dayConflicts,
    events,
    showStandby,
    showVacation,
    showSick,
    toggleEventType,
    holidayData,
    rangeStart,
    rangeEnd,
    isDraggingRange,
    selectedDate,
    selectedDates,
    handleRangeStart,
    handleRangeMove,
    finalizeRangeSelection,
    handleSelectDate,
    openBookingDialog,
    setDateRange,
    currentBalance,
    teamBalances,
    memberRemainingDays,
    createRequest,
    handleUserClick,
    handleEventActivate,
    handleClearWorkspaceSelection,
    handleToggleFullscreen,
    activeModalUser,
    selectedUserBalances,
    handleSubmit,
    handleDialogOpenChange,
    vacationSummary,
    carryOverAndBalance,
    formatDays,
    metricBars,
    conflictEntries,
    allConflictEntries,
    queryClient,
  };
};
