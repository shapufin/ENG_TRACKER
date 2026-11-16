import type { StandbyLog } from "@/types";

type GroupableLog = Pick<StandbyLog, "id" | "user" | "date" | "hours">;

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
