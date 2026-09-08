import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { userService } from "@/services/userService";
import { calendarAdminService, type HolidayPayload } from "@/services/calendarAdminService";
import { handleApiError } from "@/lib/error-handler";
import { toast } from "sonner";
import type { Team } from "@/types";

interface UseCalendarManagementOptions {
  onHolidaySuccess?: () => void;
  onHolidayDeleteSuccess?: () => void;
  onGroupRenameSuccess?: () => void;
  onGroupClearSuccess?: () => void;
  onTeamUpdateSuccess?: () => void;
  onBulkUpdateSuccess?: () => void;
}

/**
 * Custom hook for calendar management data and operations.
 * Centralizes teams, groups, and holiday logic.
 *
 * Extracted from CalendarManagementPage to reduce complexity.
 */
export const useCalendarManagement = (options?: UseCalendarManagementOptions) => {
  const qc = useQueryClient();

  const { data: teamsData, isLoading: teamsLoading } = useQuery({
    queryKey: ["admin", "teams"],
    queryFn: () => userService.getTeams({ page_size: 1000 }),
  });

  const { data: calendarGroups } = useQuery({
    queryKey: ["admin", "calendar-groups"],
    queryFn: () => userService.getCalendarGroups(),
  });

  const { data: groupStats } = useQuery({
    queryKey: ["admin", "calendar-group-stats"],
    queryFn: () => userService.getCalendarGroupStats(),
  });

  const { data: holidaysData, isLoading: holidaysLoading } = useQuery({
    queryKey: ["admin", "holidays"],
    queryFn: () => calendarAdminService.listHolidays(),
  });

  const { data: workspaceData } = useQuery({
    queryKey: ["admin", "calendar", "workspaces"],
    queryFn: () => calendarAdminService.listWorkspaces(),
  });

  const updateTeamMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<Team> }) =>
      userService.updateTeam(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "teams"] });
      qc.invalidateQueries({ queryKey: ["admin", "calendar-groups"] });
      toast.success("Calendar assignment updated");
      options?.onTeamUpdateSuccess?.();
    },
    onError: (err: unknown) => handleApiError(err),
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: ({ teamIds, calendarGroup }: { teamIds: number[]; calendarGroup: string }) =>
      userService.bulkUpdateCalendarGroup(teamIds, calendarGroup),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "teams"] });
      qc.invalidateQueries({ queryKey: ["admin", "calendar-group-stats"] });
      qc.invalidateQueries({ queryKey: ["admin", "calendar-groups"] });
      toast.success("Calendar group updated successfully");
      options?.onBulkUpdateSuccess?.();
    },
    onError: (err: unknown) => handleApiError(err),
  });

  const renameGroupMutation = useMutation({
    mutationFn: ({ oldName, newName }: { oldName: string; newName: string }) =>
      userService.renameCalendarGroup(oldName, newName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "teams"] });
      qc.invalidateQueries({ queryKey: ["admin", "calendar-group-stats"] });
      qc.invalidateQueries({ queryKey: ["admin", "calendar-groups"] });
      toast.success("Calendar group renamed successfully");
      options?.onGroupRenameSuccess?.();
    },
    onError: (err: unknown) => handleApiError(err),
  });

  const clearGroupMutation = useMutation({
    mutationFn: (calendarGroup: string) => userService.clearCalendarGroup(calendarGroup),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "teams"] });
      qc.invalidateQueries({ queryKey: ["admin", "calendar-group-stats"] });
      qc.invalidateQueries({ queryKey: ["admin", "calendar-groups"] });
      toast.success("Calendar group deleted successfully");
      options?.onGroupClearSuccess?.();
    },
    onError: (err: unknown) => handleApiError(err),
  });

  const holidayMutation = useMutation({
    mutationFn: ({ id, payload }: { id?: number; payload: HolidayPayload }) =>
      id
        ? calendarAdminService.updateHoliday(id, payload)
        : calendarAdminService.createHoliday(payload),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["admin", "holidays"] });
      toast.success(variables.id ? "Holiday updated" : "Holiday created");
      options?.onHolidaySuccess?.();
    },
    onError: (err: unknown) => handleApiError(err),
  });

  const deleteHolidayMutation = useMutation({
    mutationFn: (id: number) => calendarAdminService.deleteHoliday(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "holidays"] });
      toast.success("Holiday deleted");
      options?.onHolidayDeleteSuccess?.();
    },
    onError: (err: unknown) => handleApiError(err),
  });

  return {
    teams: teamsData?.results ?? [],
    calendarGroups,
    groupStats,
    holidays: holidaysData ?? [],
    workspaces: workspaceData ?? [],
    isLoading: teamsLoading,
    holidaysLoading,
    updateTeamMutation,
    bulkUpdateMutation,
    renameGroupMutation,
    clearGroupMutation,
    holidayMutation,
    deleteHolidayMutation,
  };
};
