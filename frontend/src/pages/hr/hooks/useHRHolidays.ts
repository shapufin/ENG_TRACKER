import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useCalendarManagement } from "@/hooks/useCalendarManagement";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import { buildHolidayFormValues } from "../../admin/hooks/useCalendarManagementPageHelpers";
import type { HolidayPayload } from "@/services/calendarAdminService";
import type { PublicHoliday } from "@/types";

/**
 * HR-native Company Holidays page data (Part D: HR reaches holiday
 * management without routing through the admin panel). Reuses the same
 * query/mutation logic as the admin Calendar Management page via
 * useCalendarManagement({ includeTeams: false }) — this page never renders
 * the Team Calendar Groups/Workspaces tabs, so the teams/calendar-group
 * queries are skipped rather than duplicated.
 */
export const useHRHolidays = () => {
  const [formOpen, setFormOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<PublicHoliday | null>(null);
  const [holidayForm, setHolidayForm] = useState(buildHolidayFormValues(undefined));
  const [deleteTarget, setDeleteTarget] = useState<PublicHoliday | null>(null);

  const resetHolidayForm = useCallback(() => setHolidayForm(buildHolidayFormValues(undefined)), []);

  const { holidays, workspaces, holidaysLoading, holidayMutation, deleteHolidayMutation } =
    useCalendarManagement({
      includeTeams: false,
      onHolidaySuccess: () => {
        setFormOpen(false);
        setEditingHoliday(null);
        resetHolidayForm();
      },
      onHolidayDeleteSuccess: () => setDeleteTarget(null),
    });

  const openHolidayForm = useCallback((holiday?: PublicHoliday) => {
    setEditingHoliday(holiday ?? null);
    setHolidayForm(buildHolidayFormValues(holiday));
    setFormOpen(true);
  }, []);

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
    workspaceOptions: workspaces,
    holidayRows,
    holidaysLoading,
    formOpen,
    setFormOpen: (open: boolean) => {
      setFormOpen(open);
      if (!open) {
        setEditingHoliday(null);
        resetHolidayForm();
      }
    },
    editingHoliday,
    holidayForm,
    setHolidayForm,
    deleteTarget,
    setDeleteTarget,
    holidayMutation,
    deleteHolidayMutation,
    openHolidayForm,
    handleHolidaySubmit,
  };
};
