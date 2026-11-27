import type { StandbyLog } from "@/types";

type GroupableLog = Pick<StandbyLog, "id" | "user" | "date" | "hours">;

export interface StandbyDaySegment {
  id: number;
  start_time: string | null;
  end_time: string | null;
  hours: number;
  status: StandbyLog["status"];
  rejection_reason?: string;
  is_carried_over?: boolean;
}

export interface DayGroupedStandbyLog extends StandbyLog {
  /** If this entry represents multiple segments of the same day, they are listed here. */
  segments?: StandbyDaySegment[];
  /** All IDs of the segments that make up this row. */
  segment_ids?: number[];
}

export interface DayGroupInfo {
  /** Not the first row of its day: the date and employee are already shown above. */
  continues: boolean;
  /** Last row of its day: carries the day total. */
  isLast: boolean;
  count: number;
  total: number;
}

/**
 * Standby nights are stored as one row per calendar day segment (item 63), so one
 * person-day can span several rows. Display only: rows of the same person and date
 * are bucketed by key (order-independent), and rows of a single-row day get no entry.
 */
export const computeDayGroups = (logs: readonly GroupableLog[]): Map<number, DayGroupInfo> => {
  const result = new Map<number, DayGroupInfo>();
  const buckets = new Map<string, GroupableLog[]>();
  for (const log of logs) {
    const key = `${log.user}::${log.date}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(log);
    else buckets.set(key, [log]);
  }
  for (const group of buckets.values()) {
    if (group.length > 1) {
      const total = group.reduce((sum, log) => sum + Number(log.hours), 0);
      for (let i = 0; i < group.length; i += 1) {
        result.set(group[i].id, {
          continues: i > 0,
          isLast: i === group.length - 1,
          count: group.length,
          total,
        });
      }
    }
  }
  return result;
};

/**
 * Collapses same-day segments of one person into a single visual row for management tables.
 * Buckets by `${user}::${date}` preserving first-seen order so interleaved rows still merge.
 * Each segment retains its id, hours and times under `segments` so actions and details can access them.
 */
export const collapseSameDayStandbyLogs = <T extends StandbyLog>(
  logs: readonly T[]
): (T & { segments?: StandbyDaySegment[]; segment_ids?: number[] })[] => {
  if (!logs || logs.length === 0) return [];
  const buckets = new Map<string, T[]>();
  for (const log of logs) {
    const key = `${log.user}::${log.date}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(log);
    else buckets.set(key, [log]);
  }

  const result: (T & { segments?: StandbyDaySegment[]; segment_ids?: number[] })[] = [];
  for (const group of buckets.values()) {
    if (group.length > 1) {
      const totalHours = group.reduce((sum, log) => sum + Number(log.hours || 0), 0);
      const segments: StandbyDaySegment[] = group.map((l) => ({
        id: l.id,
        start_time: l.start_time ?? null,
        end_time: l.end_time ?? null,
        hours: Number(l.hours),
        status: l.status,
        rejection_reason: l.rejection_reason,
        is_carried_over: l.is_carried_over,
      }));
      const resolvedStatus = group.some((l) => l.status === "pending")
        ? "pending"
        : group.every((l) => l.status === "approved")
          ? "approved"
          : group.every((l) => l.status === "rejected")
            ? "rejected"
            : group[0].status;

      result.push({
        ...group[0],
        hours: totalHours,
        status: resolvedStatus,
        segments,
        segment_ids: group.map((l) => l.id),
      });
    } else {
      result.push(group[0]);
    }
  }
  return result;
};

const cache = new WeakMap<readonly unknown[], Map<number, DayGroupInfo>>();

/** Memoised per rows array, so every cell of one render shares one pass. */
export const dayGroupsFor = (rows: readonly { original: GroupableLog }[]) => {
  let groups = cache.get(rows);
  if (!groups) {
    groups = computeDayGroups(rows.map((row) => row.original));
    cache.set(rows, groups);
  }
  return groups;
};

export const formatSegmentRange = (log: Pick<StandbyLog, "start_time" | "end_time">) =>
  log.start_time && log.end_time
    ? `${log.start_time.slice(0, 5)}–${log.end_time.slice(0, 5)}`
    : null;

/** Hours as a plain number ("6", "15", "1.5"): the API sends "6.00". */
export const formatStandbyHours = (hours: number | string) => String(Number(hours));

/**
 * Record ids behind a table selection. The table's selection keys are record ids
 * (the first segment's id for a bundled day), so a bundled row selects all its shifts.
 */
export const selectedRecordIds = (
  rows: readonly { id: number; segment_ids?: number[] }[],
  selection: Record<string, boolean>
): number[] => {
  const picked = new Set(
    Object.keys(selection)
      .filter((key) => selection[key])
      .map(Number)
  );
  return rows.filter((row) => picked.has(row.id)).flatMap((row) => row.segment_ids ?? [row.id]);
};

/** Returns pending record IDs for a single, day-bundled, or rotation-bundled row. */
export const pendingIdsOf = (row: {
  id: number;
  status: string;
  segments?: readonly { id: number; status: string }[];
  blocks?: readonly { id: number; status: string }[];
}): number[] => {
  const children = row.segments ?? row.blocks;
  if (children && children.length > 0) {
    return children.filter((c) => c.status === "pending").map((c) => c.id);
  }
  return row.status === "pending" ? [row.id] : [];
};

/** Returns only pending record IDs across all selected single or grouped rows. */
export const selectedPendingRecordIds = (
  rows: readonly {
    id: number;
    status: string;
    segments?: readonly { id: number; status: string }[];
    blocks?: readonly { id: number; status: string }[];
  }[],
  selection: Record<string, boolean>
): number[] => {
  const picked = new Set(
    Object.keys(selection)
      .filter((key) => selection[key])
      .map(Number)
  );
  return rows.filter((row) => picked.has(row.id)).flatMap((row) => pendingIdsOf(row));
};

export interface StandbyRotationLog extends DayGroupedStandbyLog {
  date_end?: string;
  day_count?: number;
  breakdown?: string;
  days?: DayGroupedStandbyLog[];
}

export interface MonthlyStandbySection {
  monthKey: string;
  monthLabel: string;
  rows: StandbyRotationLog[];
  totalShifts: number;
  totalHours: number;
  pendingCount: number;
}

const MS_PER_DAY = 86_400_000;

function parseIsoUtcMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

function buildRotationBreakdown(days: readonly DayGroupedStandbyLog[]): string {
  const counts = new Map<number, number>();
  for (const day of days) {
    const h = Number(day.hours || 0);
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([a], [b]) => a - b)
    .map(([h, count]) => `${count}×${formatStandbyHours(h)}h`)
    .join(" + ");
}

/**
 * Groups consecutive collapsed standby days of one person into multi-day rotations.
 * Breaks on calendar gaps > 1 day or payroll period changes (`requested_processing_period`).
 */
export function buildStandbyRotations(
  collapsedDays: readonly DayGroupedStandbyLog[]
): StandbyRotationLog[] {
  if (!collapsedDays || collapsedDays.length === 0) return [];
  const byUser = new Map<number, DayGroupedStandbyLog[]>();
  for (const day of collapsedDays) {
    const list = byUser.get(day.user);
    if (list) list.push(day);
    else byUser.set(day.user, [day]);
  }

  const rotations: StandbyRotationLog[] = [];
  for (const userDays of byUser.values()) {
    const sorted = [...userDays].sort((a, b) => a.date.localeCompare(b.date));
    const buckets: DayGroupedStandbyLog[][] = [];
    for (const day of sorted) {
      const current = buckets[buckets.length - 1];
      if (!current) {
        buckets.push([day]);
        continue;
      }
      const prev = current[current.length - 1];
      const diffDays = Math.round(
        (parseIsoUtcMs(day.date) - parseIsoUtcMs(prev.date)) / MS_PER_DAY
      );
      const samePeriod =
        (day.requested_processing_period ?? "") === (prev.requested_processing_period ?? "");
      if (diffDays <= 1 && samePeriod) {
        current.push(day);
      } else {
        buckets.push([day]);
      }
    }

    for (const days of buckets) {
      if (days.length === 1) {
        rotations.push(days[0]);
        continue;
      }
      const first = days[0];
      const last = days[days.length - 1];
      const allSegments: StandbyDaySegment[] = days.flatMap((d) =>
        d.segments && d.segments.length > 0
          ? d.segments
          : [
              {
                id: d.id,
                start_time: d.start_time ?? null,
                end_time: d.end_time ?? null,
                hours: Number(d.hours || 0),
                status: d.status,
                rejection_reason: d.rejection_reason,
                is_carried_over: d.is_carried_over,
              },
            ]
      );
      const allSegmentIds = allSegments.map((s) => s.id);
      const resolvedStatus = allSegments.some((s) => s.status === "pending")
        ? "pending"
        : allSegments.some((s) => s.status === "approved")
          ? "approved"
          : "rejected";
      const nonRejectedHours = allSegments
        .filter((s) => s.status !== "rejected")
        .reduce((sum, s) => sum + Number(s.hours || 0), 0);

      rotations.push({
        ...first,
        date_end: last.date,
        day_count: days.length,
        hours: nonRejectedHours,
        breakdown: buildRotationBreakdown(days),
        days,
        segments: allSegments,
        segment_ids: allSegmentIds,
        status: resolvedStatus,
      });
    }
  }

  return rotations.sort((a, b) => b.date.localeCompare(a.date) || a.id - b.id);
}

const STANDBY_MONTH_NAMES = [
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

function formatStandbyMonth(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return monthKey;
  return `${STANDBY_MONTH_NAMES[m - 1]} ${y}`;
}

export function buildMonthlyStandbySections(
  rotations: readonly StandbyRotationLog[]
): MonthlyStandbySection[] {
  if (!rotations.length) return [];
  const byMonth = new Map<string, StandbyRotationLog[]>();
  for (const row of rotations) {
    const monthKey = (row.requested_processing_period || row.date).slice(0, 7);
    const list = byMonth.get(monthKey);
    if (list) list.push(row);
    else byMonth.set(monthKey, [row]);
  }
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([monthKey, monthRows]) => {
      let totalShifts = 0;
      let totalHours = 0;
      let pendingCount = 0;
      for (const r of monthRows) {
        const segs = r.segments;
        if (segs && segs.length > 0) {
          totalShifts += segs.length;
          pendingCount += segs.filter((s) => s.status === "pending").length;
          totalHours += segs
            .filter((s) => s.status !== "rejected")
            .reduce((sSum, s) => sSum + Number(s.hours || 0), 0);
        } else {
          totalShifts += 1;
          if (r.status === "pending") pendingCount += 1;
          if (r.status !== "rejected") totalHours += Number(r.hours || 0);
        }
      }
      return {
        monthKey,
        monthLabel: formatStandbyMonth(monthKey),
        rows: monthRows,
        totalShifts,
        totalHours,
        pendingCount,
      };
    });
}
