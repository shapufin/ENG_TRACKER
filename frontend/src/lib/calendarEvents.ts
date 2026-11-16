import { deriveFullName } from "./user-utils";
import {
  collapseSameDayStandbyLogs,
  formatSegmentRange,
  formatStandbyHours,
} from "@/lib/standbyDayGroups";
import type { StandbyLog, LeaveRequest, PublicHoliday, User } from "@/types";
import type { CalendarEvent } from "@/components/calendar/types";

export interface CalendarEventFilters {
  showStandby: boolean;
  showVacation: boolean;
  showSick: boolean;
  showFilters: boolean;
  visibleUsers: Set<number>;
}

const resolveUserName = (
  userLookup: Record<number, User>,
  userId?: number,
  fallback?: string | null
) => {
  if (!userId) return fallback?.trim() ?? "";
  const meta = userLookup[userId];
  if (meta?.full_name?.trim()) return meta.full_name.trim();
  if (meta) return deriveFullName(meta);
  return fallback?.trim() ?? "";
};

export const buildCalendarEvents = (
  standby: StandbyLog[] = [],
  leaveRequests: LeaveRequest[] = [],
  holidays: PublicHoliday[] = [],
  allUsers: User[] = [],
  filters: CalendarEventFilters,
  hasWorkspaceSelection: boolean
): CalendarEvent[] => {
  if (!hasWorkspaceSelection) return [];

  const { showStandby, showVacation, showSick, showFilters, visibleUsers } = filters;
  const userLookup = allUsers.reduce<Record<number, User>>((acc, current) => {
    acc[current.id] = current;
    return acc;
  }, {});

  const items: CalendarEvent[] = [];
  const isVisible = (userId: number) =>
    !showFilters || visibleUsers.size === 0 || visibleUsers.has(userId);

  if (showStandby) {
    // One pill per person and day: the weekly generator stores a night as several
    // segment records (item 63), which would otherwise stack up in a month cell.
    const perDay = [...standby].sort(
      (a, b) =>
        a.user - b.user ||
        a.date.localeCompare(b.date) ||
        (a.start_time ?? "").localeCompare(b.start_time ?? "")
    );
    collapseSameDayStandbyLogs(perDay).forEach((log) => {
      if (!isVisible(log.user)) return;
      const hours = formatStandbyHours(log.hours);
      const shifts = log.segments
        ?.map((seg) => formatSegmentRange(seg))
        .filter(Boolean)
        .join(", ");
      items.push({
        id: `sb-${log.id}`,
        title: `SB: ${hours}h`,
        start: log.date,
        end: log.date,
        type: "standby",
        status: log.status as CalendarEvent["status"],
        userId: log.user,
        userName: resolveUserName(userLookup, log.user, log.user_name),
        // Standby only: a shift is where the on-call grade matters. Leave
        // events deliberately carry no tech level.
        userTechLevels: log.user_tech_levels,
        hours: log.hours,
        segmentIds: log.segment_ids,
        pendingSegmentIds: log.segments
          ?.filter((seg) => seg.status === "pending")
          .map((seg) => seg.id),
        description: shifts
          ? [`Shifts: ${shifts}`, log.description].filter(Boolean).join(" · ")
          : log.description,
        clientNames: log.client_names,
        compactLabel: log.client_names?.length
          ? `Standby (${hours}h) · ${log.client_names.join(", ")}`
          : `Standby (${hours}h)`,
      });
    });
  }

  if (showVacation || showSick) {
    leaveRequests.forEach((req) => {
      if (!isVisible(req.user)) return;
      if (req.request_type === "vacation" && showVacation) {
        const halfDayPeriod = req.is_half_day
          ? req.half_day_period === "afternoon"
            ? "afternoon"
            : "morning"
          : undefined;
        const period = halfDayPeriod === "afternoon" ? "PM" : "AM";
        items.push({
          id: `vac-${req.id}`,
          title: halfDayPeriod ? `Vac: ½d (${period})` : `Vac: ${req.days_requested}d`,
          isHalfDay: !!halfDayPeriod,
          halfDayPeriod,
          start: req.start_date,
          end: req.end_date,
          type: "vacation",
          status: req.status as CalendarEvent["status"],
          userId: req.user,
          userName: resolveUserName(userLookup, req.user, req.user_full_name ?? req.user_name),
          days: req.days_requested,
          description: req.reason,
          compactLabel: halfDayPeriod
            ? `Vacation (½ day ${period})`
            : `Vacation (${req.days_requested}d)`,
        });
      }
      if (req.request_type === "sick" && showSick) {
        items.push({
          id: `sick-${req.id}`,
          title: `Sick: ${req.days_requested}d`,
          start: req.start_date,
          end: req.end_date,
          type: "sick",
          status: req.status as CalendarEvent["status"],
          userId: req.user,
          userName: resolveUserName(userLookup, req.user, req.user_full_name ?? req.user_name),
          days: req.days_requested,
          description: req.reason,
          compactLabel: `Sick leave (${req.days_requested}d)`,
        });
      }
    });
  }

  holidays.forEach((holiday) => {
    items.push({
      id: `holiday-${holiday.id}`,
      title: holiday.name,
      start: holiday.date,
      end: holiday.date,
      type: "holiday",
      status: "approved",
      description: holiday.description,
      compactLabel: holiday.name,
    });
  });

  return items;
};
