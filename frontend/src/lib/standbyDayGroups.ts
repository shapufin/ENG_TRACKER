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
 * person-day can span several rows. Display only: adjacent rows of the same person
 * and date are grouped, and rows of a single-row day get no entry at all.
 */
export const computeDayGroups = (logs: readonly GroupableLog[]): Map<number, DayGroupInfo> => {
  const result = new Map<number, DayGroupInfo>();
  let start = 0;
  while (start < logs.length) {
    let end = start + 1;
    while (
      end < logs.length &&
      logs[end].user === logs[start].user &&
      logs[end].date === logs[start].date
    ) {
      end += 1;
    }
    const count = end - start;
    if (count > 1) {
      const total = logs.slice(start, end).reduce((sum, log) => sum + Number(log.hours), 0);
      for (let i = start; i < end; i += 1) {
        result.set(logs[i].id, { continues: i > start, isLast: i === end - 1, count, total });
      }
    }
    start = end;
  }
  return result;
};

/**
 * Collapses same-day segments of one person into a single visual row for management tables.
 * Each segment retains its id, hours and times under `segments` so actions and details can access them.
 */
export const collapseSameDayStandbyLogs = <T extends StandbyLog>(
  logs: readonly T[]
): (T & { segments?: StandbyDaySegment[]; segment_ids?: number[] })[] => {
  if (!logs || logs.length === 0) return [];
  const result: (T & { segments?: StandbyDaySegment[]; segment_ids?: number[] })[] = [];
  let start = 0;
  while (start < logs.length) {
    let end = start + 1;
    while (
      end < logs.length &&
      logs[end].user === logs[start].user &&
      logs[end].date === logs[start].date
    ) {
      end += 1;
    }
    const count = end - start;
    if (count > 1) {
      const group = logs.slice(start, end);
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
      result.push(logs[start]);
    }
    start = end;
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
