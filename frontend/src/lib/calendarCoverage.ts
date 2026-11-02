import { addDays, format, isSameMonth, parseISO } from "date-fns";
import type { LeaveRequest, User } from "@/types";

/** A workspace roster; coverage is measured per roster, like a team calendar. */
export interface CoverageGroup {
  workspaceId: number;
  workspaceName: string;
  users: User[];
}

export interface DayConflictUser {
  id: number;
  name: string;
  type: "vacation" | "sick";
  status: "pending" | "approved" | "rejected";
}

export interface DayConflict {
  dateKey: string;
  /** Share of the worst-covered roster still at work, 0-100. */
  coveragePct: number;
  away: number;
  total: number;
  users: DayConflictUser[];
}

export interface DayConflictEntry {
  dateKey: string;
  date: string;
  description: string;
  coveragePct: number;
  users: DayConflictUser[];
}

/** Coverage at or below this share of a roster is a conflict. */
const CONFLICT_COVERAGE = 0.5;
const MAX_SPAN_DAYS = 400;

type LeaveLike = Pick<
  LeaveRequest,
  "user" | "start_date" | "end_date" | "status" | "request_type"
> & { user_name?: string; user_full_name?: string };

const isWeekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6;

/**
 * Days where approved vacation/sick leave leaves a roster at or below 50% coverage.
 *
 * Only approved leave counts (a pending request is not yet a commitment), weekends and
 * public holidays are skipped, and rosters of one person are ignored: they would read 0%
 * every time that person is away. A day reports the worst-covered roster.
 */
export const buildDayConflicts = ({
  leaves,
  groups,
  holidayDates = new Set<string>(),
}: {
  leaves: LeaveLike[];
  groups: CoverageGroup[];
  holidayDates?: ReadonlySet<string>;
}): Map<string, DayConflict> => {
  const rosters = groups
    .map((group) => ({ ids: new Set(group.users.map((u) => u.id)), group }))
    .filter((r) => r.ids.size >= 2);

  // dayKey -> roster index -> member id -> leave
  const awayByDay = new Map<string, Map<number, Map<number, LeaveLike>>>();

  for (const leave of leaves) {
    if (leave.status !== "approved") continue;
    if (leave.request_type !== "vacation" && leave.request_type !== "sick") continue;
    const start = parseISO(leave.start_date);
    const end = parseISO(leave.end_date);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

    let cursor = start;
    for (let i = 0; cursor <= end && i < MAX_SPAN_DAYS; i += 1, cursor = addDays(cursor, 1)) {
      const key = format(cursor, "yyyy-MM-dd");
      if (isWeekend(cursor) || holidayDates.has(key)) continue;
      rosters.forEach((roster, index) => {
        if (!roster.ids.has(leave.user)) return;
        const byRoster = awayByDay.get(key) ?? new Map<number, Map<number, LeaveLike>>();
        const members = byRoster.get(index) ?? new Map<number, LeaveLike>();
        members.set(leave.user, leave);
        byRoster.set(index, members);
        awayByDay.set(key, byRoster);
      });
    }
  }

  const conflicts = new Map<string, DayConflict>();
  for (const [key, byRoster] of awayByDay) {
    let worst: { coverage: number; away: number; total: number } | null = null;
    const users = new Map<number, DayConflictUser>();
    for (const [index, members] of byRoster) {
      const total = rosters[index].ids.size;
      const coverage = (total - members.size) / total;
      if (coverage > CONFLICT_COVERAGE) continue;
      if (!worst || coverage < worst.coverage) worst = { coverage, away: members.size, total };
      for (const leave of members.values()) {
        if (users.has(leave.user)) continue;
        const rosterUser = rosters[index].group.users.find((u) => u.id === leave.user);
        users.set(leave.user, {
          id: leave.user,
          name:
            leave.user_full_name ??
            leave.user_name ??
            (rosterUser as User & { full_name?: string })?.full_name ??
            `User ${leave.user}`,
          type: leave.request_type as "vacation" | "sick",
          status: "approved",
        });
      }
    }
    if (worst) {
      conflicts.set(key, {
        dateKey: key,
        coveragePct: Math.round(worst.coverage * 100),
        away: worst.away,
        total: worst.total,
        users: [...users.values()],
      });
    }
  }
  return conflicts;
};

/** Conflict days of one month, in date order, shaped for the conflicts card and modal. */
export const conflictEntriesForMonth = (
  conflicts: ReadonlyMap<string, DayConflict>,
  month: Date
): DayConflictEntry[] =>
  [...conflicts.values()]
    .filter((c) => isSameMonth(parseISO(c.dateKey), month))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
    .map((c) => ({
      dateKey: c.dateKey,
      date: format(parseISO(c.dateKey), "PP"),
      description: `${c.away}/${c.total} on leave (${c.coveragePct}% coverage)`,
      coveragePct: c.coveragePct,
      users: c.users,
    }));
