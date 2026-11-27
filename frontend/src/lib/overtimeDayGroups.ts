import type { OvertimeLog, Status } from "@/types";

export interface OvertimeDayBlock {
  id: number;
  start_time: string | null;
  end_time: string | null;
  hours: number;
  status: Status;
  client_name?: string;
  ticket_references?: string[];
  description?: string;
  rejection_reason?: string;
  is_carried_over?: boolean;
}

export interface DayGroupedOvertimeLog extends OvertimeLog {
  /** Present when 2+ blocks share the same user, date, and payroll period. */
  blocks?: OvertimeDayBlock[];
  /** All block IDs in this day group (for bulk selection & actions). */
  segment_ids?: number[];
}

export interface MonthlyOvertimeSection {
  monthKey: string;
  monthLabel: string;
  rows: DayGroupedOvertimeLog[];
  totalBlocks: number;
  totalHours: number;
  pendingCount: number;
}

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

export function formatMonthHeading(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return monthKey;
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function resolveGroupStatus(statuses: readonly Status[]): Status {
  if (statuses.some((s) => s === "pending")) return "pending";
  if (statuses.some((s) => s === "approved")) return "approved";
  return "rejected";
}

/**
 * Collapses same-day overtime blocks for the same person and payroll period into one summary row.
 * Never merges across `requested_processing_period` boundaries (item 23).
 * Single-block days return untouched with `blocks === undefined`.
 */
export function collapseSameDayOvertimeLogs<T extends OvertimeLog>(
  logs: readonly T[]
): (T & { blocks?: OvertimeDayBlock[]; segment_ids?: number[] })[] {
  if (!logs || logs.length === 0) return [];
  const buckets = new Map<string, T[]>();
  for (const log of logs) {
    const periodKey = log.requested_processing_period ?? "";
    const key = `${log.user}::${log.date}::${periodKey}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(log);
    else buckets.set(key, [log]);
  }

  const result: (T & { blocks?: OvertimeDayBlock[]; segment_ids?: number[] })[] = [];
  for (const rawGroup of buckets.values()) {
    if (rawGroup.length === 1) {
      result.push(rawGroup[0]);
      continue;
    }
    const group = [...rawGroup].sort(
      (a, b) => (a.start_time ?? "99:99").localeCompare(b.start_time ?? "99:99") || a.id - b.id
    );
    const totalHours = group
      .filter((l) => l.status !== "rejected")
      .reduce((sum, l) => sum + Number(l.hours || 0), 0);
    const blocks: OvertimeDayBlock[] = group.map((l) => ({
      id: l.id,
      start_time: l.start_time ?? null,
      end_time: l.end_time ?? null,
      hours: Number(l.hours || 0),
      status: l.status,
      client_name: l.client_name,
      ticket_references: l.ticket_references,
      description: l.description,
      rejection_reason: l.rejection_reason,
      is_carried_over: l.is_carried_over,
    }));
    const uniqueTickets = Array.from(
      new Set(group.flatMap((l) => l.ticket_references ?? []).filter(Boolean))
    );
    result.push({
      ...group[0],
      hours: totalHours,
      status: resolveGroupStatus(group.map((l) => l.status)),
      ticket_references: uniqueTickets.length > 0 ? uniqueTickets : group[0].ticket_references,
      blocks,
      segment_ids: group.map((l) => l.id),
    });
  }
  return result;
}

/**
 * Organizes day-grouped overtime rows into reverse-chronological monthly sections.
 */
export function buildMonthlyOvertimeSections(
  rows: readonly DayGroupedOvertimeLog[]
): MonthlyOvertimeSection[] {
  if (!rows.length) return [];
  const byMonth = new Map<string, DayGroupedOvertimeLog[]>();
  for (const row of rows) {
    const monthKey = (row.requested_processing_period || row.date).slice(0, 7);
    const list = byMonth.get(monthKey);
    if (list) list.push(row);
    else byMonth.set(monthKey, [row]);
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([monthKey, monthRows]) => {
      let totalBlocks = 0;
      let totalHours = 0;
      let pendingCount = 0;
      for (const r of monthRows) {
        if (r.blocks && r.blocks.length > 0) {
          totalBlocks += r.blocks.length;
          pendingCount += r.blocks.filter((b) => b.status === "pending").length;
          totalHours += Number(r.hours || 0);
        } else {
          totalBlocks += 1;
          if (r.status === "pending") pendingCount += 1;
          if (r.status !== "rejected") totalHours += Number(r.hours || 0);
        }
      }
      return {
        monthKey,
        monthLabel: formatMonthHeading(monthKey),
        rows: monthRows,
        totalBlocks,
        totalHours,
        pendingCount,
      };
    });
}
