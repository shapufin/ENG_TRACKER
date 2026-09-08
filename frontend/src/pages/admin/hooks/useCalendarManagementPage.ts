import { useState, useCallback, useMemo } from "react";
import { useCalendarManagement } from "@/hooks/useCalendarManagement";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import { buildHolidayFormValues } from "./useCalendarManagementPageHelpers";
import { toast } from "sonner";
import type { HolidayPayload } from "@/services/calendarAdminService";
import type { PublicHoliday, Team } from "@/types";

export const useCalendarManagementPage = () => {
  const [activeTab, setActiveTab] = useState<"team-groups" | "workspaces" | "holidays">(
    "team-groups"
  );
  const [selectedTeams, setSelectedTeams] = useState<Set<number>>(new Set());
  const [bulkGroup, setBulkGroup] = useState("");
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [pendingBulkGroup, setPendingBulkGroup] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [form, setForm] = useState({ calendar_group: "" });
  const [holidayFormOpen, setHolidayFormOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<PublicHoliday | null>(null);
  const [holidayForm, setHolidayForm] = useState({
    name: "",
    date: "",
    country_code: "",
    is_global: true,
    description: "",
    calendar: "global",
  });
  const [deleteTarget, setDeleteTarget] = useState<PublicHoliday | null>(null);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<string | null>(null);
  const [editGroupOpen, setEditGroupOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [manageTeamsOpen, setManageTeamsOpen] = useState(false);
  const [managingGroup, setManagingGroup] = useState<string | null>(null);

  const {
    teams,
    calendarGroups,
    groupStats,
    holidays,
    workspaces: workspaceOptions,
    isLoading,
    holidaysLoading,
    updateTeamMutation,
    bulkUpdateMutation,
    renameGroupMutation,
    clearGroupMutation,
    holidayMutation,
    deleteHolidayMutation,
  } = useCalendarManagement({
    onHolidaySuccess: () => {
      setHolidayFormOpen(false);
      setEditingHoliday(null);
      resetHolidayForm();
    },
    onHolidayDeleteSuccess: () => setDeleteTarget(null),
    onGroupRenameSuccess: () => {
      setEditGroupOpen(false);
      setEditingGroup(null);
      setNewGroupName("");
    },
    onGroupClearSuccess: () => setDeleteGroupTarget(null),
    onTeamUpdateSuccess: () => {
      setFormOpen(false);
      setEditingTeam(null);
      setForm({ calendar_group: "" });
    },
    onBulkUpdateSuccess: () => {
      setSelectedTeams(new Set());
      setBulkGroup("");
    },
  });

  const resetHolidayForm = useCallback(
    () =>
      setHolidayForm({
        name: "",
        date: "",
        country_code: "",
        is_global: true,
        description: "",
        calendar: "global",
      }),
    []
  );

  const openHolidayForm = useCallback((holiday?: PublicHoliday) => {
    if (holiday) setEditingHoliday(holiday);
    else setEditingHoliday(null);
    setHolidayForm(buildHolidayFormValues(holiday));
    setHolidayFormOpen(true);
  }, []);

  const openEdit = useCallback((team: Team) => {
    setEditingTeam(team);
    setForm({ calendar_group: team.calendar_group || "" });
    setFormOpen(true);
  }, []);

  const handleBulkApplyIntent = () => {
    if (!bulkGroup.trim() || selectedTeams.size === 0) return;
    setPendingBulkGroup(bulkGroup.trim());
    setBulkConfirmOpen(true);
  };

  const confirmBulkUpdate = () => {
    if (!pendingBulkGroup || selectedTeams.size === 0) return;
    bulkUpdateMutation.mutate({
      teamIds: Array.from(selectedTeams),
      calendarGroup: pendingBulkGroup,
    });
    setBulkConfirmOpen(false);
    setPendingBulkGroup(null);
  };

  const handleHolidaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayForm.name.trim() || !holidayForm.date) {
      toast.error("Name and date are required");
      return;
    }
    const payload: HolidayPayload = {
      name: holidayForm.name.trim(),
      date: holidayForm.date,
      country_code: holidayForm.country_code || undefined,
      is_global: holidayForm.is_global,
      description: holidayForm.description || undefined,
      calendar:
        holidayForm.is_global || holidayForm.calendar === "global"
          ? null
          : Number(holidayForm.calendar),
    };
    holidayMutation.mutate({ id: editingHoliday?.id, payload });
  };

  const holidayRows = useMemo(
    () =>
      holidays.map((h) => ({
        ...h,
        formattedDate: formatDateDDMMYYYY(h.date),
        scope: h.is_global ? "Global" : h.calendar_name || "Workspace",
      })),
    [holidays]
  );

  return {
    activeTab,
    setActiveTab,
    selectedTeams,
    setSelectedTeams,
    bulkGroup,
    setBulkGroup,
    bulkConfirmOpen,
    setBulkConfirmOpen,
    pendingBulkGroup,
    setPendingBulkGroup,
    formOpen,
    setFormOpen,
    editingTeam,
    setEditingTeam,
    form,
    setForm,
    holidayFormOpen,
    setHolidayFormOpen,
    editingHoliday,
    setEditingHoliday,
    holidayForm,
    setHolidayForm,
    deleteTarget,
    setDeleteTarget,
    deleteGroupTarget,
    setDeleteGroupTarget,
    editGroupOpen,
    setEditGroupOpen,
    editingGroup,
    setEditingGroup,
    newGroupName,
    setNewGroupName,
    searchQuery,
    setSearchQuery,
    manageTeamsOpen,
    setManageTeamsOpen,
    managingGroup,
    setManagingGroup,
    teams,
    calendarGroups,
    groupStats,
    holidays,
    workspaceOptions,
    isLoading,
    holidaysLoading,
    updateTeamMutation,
    bulkUpdateMutation,
    renameGroupMutation,
    clearGroupMutation,
    holidayMutation,
    deleteHolidayMutation,
    resetHolidayForm,
    openHolidayForm,
    openEdit,
    handleBulkApplyIntent,
    confirmBulkUpdate,
    handleHolidaySubmit,
    holidayRows,
  };
};
