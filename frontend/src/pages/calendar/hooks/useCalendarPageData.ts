import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { leaveService } from "@/services/leaveService";
import type { LeaveRequest, LeaveBalance, User } from "@/types";
import { handleApiError } from "@/lib/error-handler";
import { toast } from "sonner";
import { deriveFullName } from "@/lib/user-utils";
import { deriveVacationBalanceFromBalances } from "@/lib/vacation-balance";

import { buildMetricBars, computeCarryOverAndBalance, formatDays } from "@/lib/calendarPageMetrics";
import { buildConflictEntries, buildAllConflictEntries } from "@/lib/calendarPageConflicts";
import { useCalendarQueries } from "@/hooks/useCalendarQueries";
import { useCalendarEvents } from "@/hooks/useCalendarEvents";
import { useUserVisibility } from "@/hooks/useUserVisibility";
import { useRangeSelection } from "@/hooks/useRangeSelection";
import { useWorkspaceData } from "@/components/calendar/hooks/useWorkspaceData";

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
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<"month" | "week" | "list">(() => {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      return window.matchMedia("(max-width: 767px)").matches ? "list" : "month";
    }
    return "month";
  });
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
  } = useUserVisibility({ allUsers });

  const {
    events,
    isLoading: eventsLoading,
    hasError: eventsError,
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
  } = useRangeSelection({ onRangeSelected: () => setDialogOpen(true) });

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
  const conflictEntries = useMemo(() => buildConflictEntries(events), [events]);
  const allConflictEntries = useMemo(() => buildAllConflictEntries(events), [events]);

  return {
    currentMonth,
    setCurrentMonth,
    viewMode,
    setViewMode,
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
    groupedUsersWithNames,
    workspaceUsersPartial,
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
