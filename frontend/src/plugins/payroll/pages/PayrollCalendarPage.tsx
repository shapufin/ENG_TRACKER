/**
 * PayrollCalendarPage — view the payroll work calendar with a visual month
 * grid, per-month summary stats, and full holiday CRUD.
 */
import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { payrollService } from "../services/payrollService";
import { usePluginPermissions } from "@/hooks/usePluginPermissions";
import { handleApiError } from "@/lib/error-handler";
import { toast } from "sonner";
import type { PayrollWorkday } from "../types";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Pad a number to 2 digits for ISO date strings. */
const pad2 = (n: number) => String(n).padStart(2, "0");

/** Build an ISO date string (YYYY-MM-DD) from year/month/day. */
const isoDate = (year: number, month: number, day: number) => `${year}-${pad2(month)}-${pad2(day)}`;

export const PayrollCalendarPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { canConfigure } = usePluginPermissions();
  const canConfigurePayroll = canConfigure("payroll");

  const [selectedCalendarId, setSelectedCalendarId] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [addHolidayOpen, setAddHolidayOpen] = useState(false);
  const [editHoliday, setEditHoliday] = useState<PayrollWorkday | null>(null);
  const [deleteHoliday, setDeleteHoliday] = useState<PayrollWorkday | null>(null);
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayName, setNewHolidayName] = useState("");
  const [editHolidayName, setEditHolidayName] = useState("");

  const {
    data: calendars,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["payroll-calendars"],
    queryFn: () => payrollService.getWorkCalendars(),
  });

  // Derive the effective calendar ID: explicit selection → active → first.
  const effectiveCalendarId = useMemo(() => {
    if (selectedCalendarId !== null) return selectedCalendarId;
    if (calendars && calendars.length > 0) {
      const active = calendars.find((c) => c.is_active);
      return (active ?? calendars[0]).id;
    }
    return null;
  }, [selectedCalendarId, calendars]);

  const selectedCalendar = useMemo(
    () => calendars?.find((c) => c.id === effectiveCalendarId) ?? null,
    [calendars, effectiveCalendarId]
  );

  // Unique sorted years available across all calendars.
  const availableYears = useMemo(() => {
    if (!calendars) return [] as number[];
    return Array.from(new Set(calendars.map((c) => c.year))).sort((a, b) => a - b);
  }, [calendars]);

  const { data: monthSummary, isFetching: summaryFetching } = useQuery({
    queryKey: ["payroll-calendar-month-summary", effectiveCalendarId, selectedMonth],
    queryFn: () =>
      payrollService.getWorkCalendarMonthSummary(effectiveCalendarId as number, selectedMonth),
    enabled: effectiveCalendarId !== null,
  });

  const generateMutation = useMutation({
    mutationFn: (id: number) => payrollService.generateWorkCalendarYear(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-calendars"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-calendar-month-summary"] });
      toast.success("Work calendar regenerated");
    },
    onError: (error) => handleApiError(error),
  });

  const addHolidayMutation = useMutation({
    mutationFn: ({ calendarId, date, name }: { calendarId: number; date: string; name: string }) =>
      payrollService.addHoliday(calendarId, date, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-calendars"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-calendar-month-summary"] });
      toast.success("Holiday added");
      setAddHolidayOpen(false);
      setNewHolidayDate("");
      setNewHolidayName("");
    },
    onError: (error) => handleApiError(error),
  });

  const updateHolidayMutation = useMutation({
    mutationFn: ({
      calendarId,
      workdayId,
      name,
    }: {
      calendarId: number;
      workdayId: number;
      name: string;
    }) => payrollService.updateHoliday(calendarId, workdayId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-calendars"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-calendar-month-summary"] });
      toast.success("Holiday updated");
      setEditHoliday(null);
      setEditHolidayName("");
    },
    onError: (error) => handleApiError(error),
  });

  const removeHolidayMutation = useMutation({
    mutationFn: ({ calendarId, workdayId }: { calendarId: number; workdayId: number }) =>
      payrollService.removeHoliday(calendarId, workdayId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-calendars"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-calendar-month-summary"] });
      toast.success("Holiday removed");
      setDeleteHoliday(null);
    },
    onError: (error) => handleApiError(error),
  });

  // --- Month grid construction -------------------------------------------------
  const monthWorkdays = useMemo<PayrollWorkday[]>(() => {
    if (!selectedCalendar?.workdays) return [];
    return selectedCalendar.workdays
      .filter((w) => {
        const d = new Date(w.date + "T00:00:00");
        return d.getFullYear() === selectedCalendar.year && d.getMonth() + 1 === selectedMonth;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [selectedCalendar, selectedMonth]);

  const gridCells = useMemo(() => {
    if (!selectedCalendar) return [];
    const year = selectedCalendar.year;
    const firstDay = new Date(year, selectedMonth - 1, 1);
    const daysInMonth = new Date(year, selectedMonth, 0).getDate();
    // Monday-first offset: JS getDay() is 0=Sun..6=Sat → (getDay()+6)%7
    const offset = (firstDay.getDay() + 6) % 7;
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === selectedMonth;

    const byDay = new Map<number, PayrollWorkday>();
    for (const w of monthWorkdays) {
      byDay.set(new Date(w.date + "T00:00:00").getDate(), w);
    }

    const cells: Array<{
      day: number | null;
      workday: PayrollWorkday | null;
      isWeekend: boolean;
      isToday: boolean;
    }> = [];
    for (let i = 0; i < offset; i++) {
      cells.push({ day: null, workday: null, isWeekend: false, isToday: false });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(year, selectedMonth - 1, day);
      const dow = dateObj.getDay();
      cells.push({
        day,
        workday: byDay.get(day) ?? null,
        isWeekend: dow === 0 || dow === 6,
        isToday: isCurrentMonth && day === today.getDate(),
      });
    }
    // Trailing empty cells to complete the final week row.
    while (cells.length % 7 !== 0) {
      cells.push({ day: null, workday: null, isWeekend: false, isToday: false });
    }
    return cells;
  }, [selectedCalendar, selectedMonth, monthWorkdays]);

  const monthHolidays = useMemo(() => monthWorkdays.filter((w) => w.is_holiday), [monthWorkdays]);

  // --- Dialog helpers ----------------------------------------------------------
  const openAddHoliday = () => {
    if (selectedCalendar) {
      setNewHolidayDate(isoDate(selectedCalendar.year, selectedMonth, 1));
    }
    setNewHolidayName("");
    setAddHolidayOpen(true);
  };

  const submitAddHoliday = () => {
    if (!effectiveCalendarId || !newHolidayDate || !newHolidayName.trim()) return;
    const holidayYear = new Date(newHolidayDate).getFullYear();
    if (selectedCalendar && holidayYear !== selectedCalendar.year) {
      toast.error(`Holiday date must be within ${selectedCalendar.year}`);
      return;
    }
    addHolidayMutation.mutate({
      calendarId: effectiveCalendarId,
      date: newHolidayDate,
      name: newHolidayName.trim(),
    });
  };

  const openEditHoliday = (w: PayrollWorkday) => {
    setEditHoliday(w);
    setEditHolidayName(w.holiday_name);
  };

  const submitEditHoliday = () => {
    if (!effectiveCalendarId || !editHoliday || !editHolidayName.trim()) return;
    updateHolidayMutation.mutate({
      calendarId: effectiveCalendarId,
      workdayId: editHoliday.id,
      name: editHolidayName.trim(),
    });
  };

  const confirmRemoveHoliday = () => {
    if (!effectiveCalendarId || !deleteHoliday) return;
    removeHolidayMutation.mutate({
      calendarId: effectiveCalendarId,
      workdayId: deleteHoliday.id,
    });
  };

  if (isLoading) return <LoadingCard rows={4} className="min-h-[300px]" />;
  if (error) return <ErrorCard title="Failed to load work calendars" onRetry={refetch} />;

  return (
    <PageShell title="Work Calendar" subtitle="Authoritative payroll work calendar with holidays">
      {calendars && calendars.length > 0 ? (
        <div className="space-y-4">
          {/* Selectors */}
          <GlassCard className="p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-40">
                <Label htmlFor="year-select">Year</Label>
                <Select
                  value={selectedCalendar ? String(selectedCalendar.year) : undefined}
                  onValueChange={(v) => {
                    const year = Number(v);
                    const match = calendars.find((c) => c.year === year);
                    if (match) setSelectedCalendarId(match.id);
                  }}
                >
                  <SelectTrigger id="year-select">
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableYears.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-40">
                <Label htmlFor="month-select">Month</Label>
                <Select
                  value={String(selectedMonth)}
                  onValueChange={(v) => setSelectedMonth(Number(v))}
                >
                  <SelectTrigger id="month-select">
                    <SelectValue placeholder="Select month" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((name, idx) => (
                      <SelectItem key={idx + 1} value={String(idx + 1)}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </GlassCard>

          {/* Calendar card */}
          {selectedCalendar && (
            <GlassCard className="p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-lg font-semibold">
                    {selectedCalendar.country} {selectedCalendar.year}
                  </h3>
                  <Badge variant={selectedCalendar.is_active ? "default" : "secondary"}>
                    {selectedCalendar.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <Badge variant="outline">{MONTH_NAMES[selectedMonth - 1]}</Badge>
                </div>
                {canConfigurePayroll && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => generateMutation.mutate(selectedCalendar.id)}
                    disabled={generateMutation.isPending}
                    title="Regenerates all workdays from fixed-date holidays. Manually added holidays are preserved."
                  >
                    Regenerate
                  </Button>
                )}
              </div>

              {/* Per-month summary stats */}
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Total Days</p>
                  <p className="text-xl font-semibold">{monthSummary?.total_days ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Working Days</p>
                  <p className="text-xl font-semibold">{monthSummary?.working_days ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Holidays</p>
                  <p className="text-xl font-semibold">
                    {monthSummary?.holiday_count ?? monthHolidays.length}
                  </p>
                </div>
              </div>
              {summaryFetching && (
                <p className="mt-2 text-xs text-muted-foreground">Updating summary…</p>
              )}

              {/* Visual month grid */}
              <div className="mt-6">
                <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
                  {WEEKDAY_HEADERS.map((d) => (
                    <div key={d} className="py-1">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {gridCells.map((cell, idx) => {
                    if (cell.day === null) {
                      return <div key={idx} className="min-h-[64px] rounded-md" />;
                    }
                    const isHoliday = cell.workday?.is_holiday;
                    const cellBg = isHoliday
                      ? "bg-destructive/10"
                      : cell.isWeekend
                        ? "bg-muted/30"
                        : "bg-primary/5";
                    return (
                      <div
                        key={idx}
                        title={isHoliday ? cell.workday?.holiday_name : undefined}
                        className={`min-h-[64px] rounded-md p-1 ${cellBg} ${
                          cell.isToday ? "ring-2 ring-primary" : ""
                        }`}
                      >
                        <div className="text-xs font-semibold">{cell.day}</div>
                        {isHoliday && cell.workday?.holiday_name && (
                          <div
                            className="mt-0.5 truncate text-[10px] text-destructive"
                            title={cell.workday.holiday_name}
                          >
                            {cell.workday.holiday_name}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {selectedCalendar.source && (
                <p className="mt-4 text-xs text-muted-foreground">
                  Source: {selectedCalendar.source}
                </p>
              )}
            </GlassCard>
          )}

          {/* Holiday list table */}
          {selectedCalendar && (
            <GlassCard className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  Holidays — {MONTH_NAMES[selectedMonth - 1]} {selectedCalendar.year}
                </h3>
                {canConfigurePayroll && (
                  <Button size="sm" onClick={openAddHoliday}>
                    Add Holiday
                  </Button>
                )}
              </div>
              {monthHolidays.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-4 font-medium">Date</th>
                        <th className="py-2 pr-4 font-medium">Holiday Name</th>
                        {canConfigurePayroll && (
                          <th className="py-2 text-right font-medium">Actions</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {monthHolidays.map((w) => (
                        <tr key={w.id} className="border-b last:border-0">
                          <td className="py-2 pr-4">{w.date}</td>
                          <td className="py-2 pr-4">{w.holiday_name}</td>
                          {canConfigurePayroll && (
                            <td className="py-2 text-right">
                              <div className="inline-flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openEditHoliday(w)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => setDeleteHoliday(w)}
                                >
                                  Remove
                                </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="py-6 text-center text-muted-foreground">No holidays this month.</p>
              )}
            </GlassCard>
          )}
        </div>
      ) : (
        <GlassCard className="p-6">
          <p className="py-8 text-center text-muted-foreground">
            No work calendars found. Run the seed_payroll_calendar management command to create the
            Albania 2026 calendar.
          </p>
        </GlassCard>
      )}

      {/* Add Holiday dialog */}
      <Dialog open={addHolidayOpen} onOpenChange={setAddHolidayOpen}>
        <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-md">
          <DialogHeader className="shrink-0">
            <DialogTitle>Add Holiday</DialogTitle>
            <DialogDescription>Add a holiday to the work calendar.</DialogDescription>
          </DialogHeader>
          <div className="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-1">
            <div>
              <Label htmlFor="new-holiday-date">Date</Label>
              <Input
                id="new-holiday-date"
                type="date"
                value={newHolidayDate}
                onChange={(e) => setNewHolidayDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="new-holiday-name">Holiday Name</Label>
              <Input
                id="new-holiday-name"
                value={newHolidayName}
                onChange={(e) => setNewHolidayName(e.target.value)}
                placeholder="e.g. Independence Day"
              />
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t pt-4">
            <Button
              variant="outline"
              onClick={() => setAddHolidayOpen(false)}
              disabled={addHolidayMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={submitAddHoliday}
              disabled={addHolidayMutation.isPending || !newHolidayDate || !newHolidayName.trim()}
            >
              {addHolidayMutation.isPending ? "Adding..." : "Add Holiday"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Holiday dialog */}
      <Dialog
        open={editHoliday !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditHoliday(null);
            setEditHolidayName("");
          }
        }}
      >
        <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-md">
          <DialogHeader className="shrink-0">
            <DialogTitle>Edit Holiday</DialogTitle>
            <DialogDescription>Update the holiday name.</DialogDescription>
          </DialogHeader>
          <div className="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-1">
            {editHoliday && (
              <p className="text-sm text-muted-foreground">Date: {editHoliday.date}</p>
            )}
            <div>
              <Label htmlFor="edit-holiday-name">Holiday Name</Label>
              <Input
                id="edit-holiday-name"
                value={editHolidayName}
                onChange={(e) => setEditHolidayName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setEditHoliday(null);
                setEditHolidayName("");
              }}
              disabled={updateHolidayMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={submitEditHoliday}
              disabled={updateHolidayMutation.isPending || !editHolidayName.trim()}
            >
              {updateHolidayMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Holiday confirmation */}
      <ConfirmDialog
        open={deleteHoliday !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteHoliday(null);
        }}
        title="Remove Holiday"
        description={
          deleteHoliday ? `Remove "${deleteHoliday.holiday_name}" on ${deleteHoliday.date}?` : ""
        }
        onConfirm={confirmRemoveHoliday}
        isConfirming={removeHolidayMutation.isPending}
        confirmLabel="Remove"
        variant="destructive"
      />
    </PageShell>
  );
};
