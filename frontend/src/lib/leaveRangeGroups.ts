import type { LeaveRequest } from "@/types";
import { formatMonthHeading } from "./overtimeDayGroups";

export interface TeamOverlapPeak {
  team: string;
  peakDate: string;
  count: number;
  employeeNames: string[];
}

export interface ClusteredLeaveRequest extends LeaveRequest {
  cluster_id?: string;
  cluster_size?: number;
  cluster_range_label?: string;
  cluster_total_days?: number;
  is_cluster_head?: boolean;
  team_peaks?: TeamOverlapPeak[];
  continues_next_month?: boolean;
}

export interface MonthlyLeaveSection {
  monthKey: string;
  monthLabel: string;
  rows: ClusteredLeaveRequest[];
  totalRequests: number;
  totalDays: number;
  pendingCount: number;
}

const MS_PER_DAY = 86_400_000;

function parseIsoUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

function toIsoUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function enumerateDays(startIso: string, endIso: string): string[] {
  const start = parseIsoUtc(startIso);
  const end = parseIsoUtc(endIso);
  const out: string[] = [];
  const cursor = new Date(start.getTime());
  while (cursor <= end) {
    out.push(toIsoUtc(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function computeTeamPeaks(items: readonly LeaveRequest[]): TeamOverlapPeak[] {
  const byTeamDay = new Map<string, Map<string, Map<number, string>>>();
  for (const req of items) {
    if (req.status === "rejected" || req.status === "cancelled") continue;
    const team = req.team_name?.trim();
    if (!team) continue;
    const end = req.end_date >= req.start_date ? req.end_date : req.start_date;
    const name = req.user_full_name || req.user_name || `User ${req.user}`;
    let dayMap = byTeamDay.get(team);
    if (!dayMap) {
      dayMap = new Map();
      byTeamDay.set(team, dayMap);
    }
    for (const day of enumerateDays(req.start_date, end)) {
      let users = dayMap.get(day);
      if (!users) {
        users = new Map();
        dayMap.set(day, users);
      }
      users.set(req.user, name);
    }
  }

  const peaks: TeamOverlapPeak[] = [];
  for (const [team, dayMap] of byTeamDay.entries()) {
    let bestDate = "";
    let bestUsers: Map<number, string> | null = null;
    for (const [day, users] of dayMap.entries()) {
      if (users.size >= 2 && (!bestUsers || users.size > bestUsers.size)) {
        bestDate = day;
        bestUsers = users;
      }
    }
    if (bestUsers && bestUsers.size >= 2) {
      peaks.push({
        team,
        peakDate: bestDate,
        count: bestUsers.size,
        employeeNames: Array.from(bestUsers.values()),
      });
    }
  }
  return peaks.sort((a, b) => b.count - a.count || a.team.localeCompare(b.team));
}

/**
 * Annotates leave requests with overlap cluster metadata (`bridgeGapDays = 2`).
 * Uses server `days_requested` (holiday & half-day aware) — never recounts working days.
 * Rejected and cancelled requests are excluded from overlap clusters and team peaks.
 */
export function buildLeaveRangeClusters(
  requests: readonly LeaveRequest[],
  bridgeGapDays = 2
): ClusteredLeaveRequest[] {
  if (!requests.length) return [];

  const active = requests.filter((r) => r.status !== "rejected" && r.status !== "cancelled");
  const normalized = [...active]
    .map((req) => ({
      req,
      start: req.start_date,
      end: req.end_date >= req.start_date ? req.end_date : req.start_date,
    }))
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));

  const buckets: Array<{ startDate: string; endDate: string; items: LeaveRequest[] }> = [];
  for (const entry of normalized) {
    const last = buckets[buckets.length - 1];
    if (!last) {
      buckets.push({ startDate: entry.start, endDate: entry.end, items: [entry.req] });
      continue;
    }
    const gapDays = Math.round(
      (parseIsoUtc(entry.start).getTime() - parseIsoUtc(last.endDate).getTime()) / MS_PER_DAY
    );
    if (gapDays <= bridgeGapDays) {
      last.items.push(entry.req);
      if (entry.end > last.endDate) last.endDate = entry.end;
    } else {
      buckets.push({ startDate: entry.start, endDate: entry.end, items: [entry.req] });
    }
  }

  const annotationById = new Map<number, Partial<ClusteredLeaveRequest>>();
  buckets.forEach((bucket, idx) => {
    if (bucket.items.length < 2) return;
    const clusterId = `leave-cluster-${idx + 1}-${bucket.startDate}`;
    const totalDays = bucket.items.reduce((sum, r) => sum + Number(r.days_requested || 0), 0);
    const peaks = computeTeamPeaks(bucket.items);
    const rangeLabel =
      bucket.startDate === bucket.endDate
        ? bucket.startDate
        : `${bucket.startDate} – ${bucket.endDate}`;

    bucket.items.forEach((item, itemIdx) => {
      annotationById.set(item.id, {
        cluster_id: clusterId,
        cluster_size: bucket.items.length,
        cluster_range_label: rangeLabel,
        cluster_total_days: totalDays,
        is_cluster_head: itemIdx === 0,
        team_peaks: peaks,
      });
    });
  });

  return requests.map((req) => ({
    ...req,
    ...annotationById.get(req.id),
    continues_next_month:
      Boolean(req.end_date) && req.end_date.slice(0, 7) > req.start_date.slice(0, 7),
  }));
}

function monthKeysSpanned(startIso: string, endIso: string): string[] {
  const startMonth = startIso.slice(0, 7);
  const endMonth = (endIso >= startIso ? endIso : startIso).slice(0, 7);
  if (startMonth === endMonth) return [startMonth];
  const keys: string[] = [];
  let [y, m] = startMonth.split("-").map(Number);
  const [ey, em] = endMonth.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    keys.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return keys;
}

function clippedDaysInMonth(req: LeaveRequest, monthKey: string): number {
  if (req.status === "rejected" || req.status === "cancelled") return 0;
  const startMonth = req.start_date.slice(0, 7);
  const end = req.end_date >= req.start_date ? req.end_date : req.start_date;
  const endMonth = end.slice(0, 7);
  const total = Number(req.days_requested || 0);
  if (startMonth === endMonth) return total;

  const [y, m] = monthKey.split("-").map(Number);
  const monthStart = `${monthKey}-01`;
  const monthEnd = toIsoUtc(new Date(Date.UTC(y, m, 0)));
  const clipStart = req.start_date > monthStart ? req.start_date : monthStart;
  const clipEnd = end < monthEnd ? end : monthEnd;
  if (clipEnd < clipStart) return 0;

  const countWeekdays = (s: string, e: string) =>
    enumerateDays(s, e).filter((d) => {
      const wd = parseIsoUtc(d).getUTCDay();
      return wd !== 0 && wd !== 6;
    }).length;

  const totalWeekdays = countWeekdays(req.start_date, end);
  if (totalWeekdays === 0) return total;
  const clipWeekdays = countWeekdays(clipStart, clipEnd);
  return Math.round(((total * clipWeekdays) / totalWeekdays) * 10) / 10;
}

/**
 * Organizes leave requests into reverse-chronological monthly sections.
 * Cross-month requests appear in every month they overlap, with `totalDays`
 * clipped per month and excluding rejected/cancelled requests (item 87(v)).
 */
export function buildMonthlyLeaveSections(
  requests: readonly LeaveRequest[]
): MonthlyLeaveSection[] {
  if (!requests.length) return [];
  const byMonth = new Map<string, LeaveRequest[]>();
  for (const req of requests) {
    for (const monthKey of monthKeysSpanned(req.start_date, req.end_date)) {
      const list = byMonth.get(monthKey);
      if (list) list.push(req);
      else byMonth.set(monthKey, [req]);
    }
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([monthKey, monthRows]) => {
      const clustered = buildLeaveRangeClusters(monthRows);
      const totalDays = clustered.reduce((sum, r) => sum + clippedDaysInMonth(r, monthKey), 0);
      const pendingCount = clustered.filter((r) => r.status === "pending").length;
      return {
        monthKey,
        monthLabel: formatMonthHeading(monthKey),
        rows: clustered,
        totalRequests: clustered.length,
        totalDays: Math.round(totalDays * 10) / 10,
        pendingCount,
      };
    });
}
