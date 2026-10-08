import type { AdminOverview } from "@/types";

export type InsightSeverity = "critical" | "warning" | "info" | "positive";

export interface AdminInsight {
  /** Stable rule id, e.g. "aging-stale". */
  id: string;
  /** Rule id plus the number it was derived from; a dismissal is keyed on this. */
  signature: string;
  severity: InsightSeverity;
  title: string;
  message: string;
  to?: string;
  actionLabel?: string;
}

const RANK: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2, positive: 3 };
const STALE_CRITICAL_AT = 5;

const AGING_ROUTES = {
  overtime: "/admin/overtime-logs?status=pending",
  standby: "/admin/standby-logs?status=pending",
  leave: "/admin/leave-requests?status=pending",
} as const;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Pure rules over the admin_overview payload; most severe first. */
export function deriveAdminInsights(o: AdminOverview): AdminInsight[] {
  const out: AdminInsight[] = [];
  const add = (
    id: string,
    n: number,
    severity: InsightSeverity,
    title: string,
    message: string,
    to?: string,
    actionLabel?: string
  ) => out.push({ id, signature: `${id}:${n}`, severity, title, message, to, actionLabel });

  const stale = {
    overtime: o.approval_aging.overtime[3] ?? 0,
    standby: o.approval_aging.standby[3] ?? 0,
    leave: o.approval_aging.leave[3] ?? 0,
  };
  const staleTotal = stale.overtime + stale.standby + stale.leave;
  if (staleTotal > 0) {
    const worst = (Object.keys(stale) as (keyof typeof stale)[]).reduce((a, b) =>
      stale[b] > stale[a] ? b : a
    );
    add(
      "aging-stale",
      staleTotal,
      staleTotal >= STALE_CRITICAL_AT ? "critical" : "warning",
      "Approvals waiting over 15 days",
      `${plural(staleTotal, "request")} ${staleTotal === 1 ? "has" : "have"} been pending for 15 days or more.`,
      AGING_ROUTES[worst],
      "Review"
    );
  }

  const g = o.coverage_gaps;
  if (g.teams_without_leader > 0)
    add(
      "gap-team-leader",
      g.teams_without_leader,
      "warning",
      "Teams without a leader",
      `${plural(g.teams_without_leader, "team")} ha${g.teams_without_leader === 1 ? "s" : "ve"} no team leader.`,
      "/admin/teams",
      "Open teams"
    );
  if (g.employees_without_tl > 0)
    add(
      "gap-employee-tl",
      g.employees_without_tl,
      "warning",
      "Employees without a TL",
      `${plural(g.employees_without_tl, "employee")} cannot route approvals because no TL is assigned.`,
      "/admin/users",
      "Open users"
    );
  if (g.al_tls_without_hbpr_assignment > 0)
    add(
      "gap-hbpr",
      g.al_tls_without_hbpr_assignment,
      "warning",
      "Albanian TLs without HBPR",
      `${plural(g.al_tls_without_hbpr_assignment, "Albanian TL")} ha${g.al_tls_without_hbpr_assignment === 1 ? "s" : "ve"} no HBPR assignment in effect.`,
      "/admin/hbpr-assignments",
      "Assign"
    );

  const risk = round1(o.carryover_expiry.days_at_risk);
  if (risk > 0)
    add(
      "carryover-risk",
      risk,
      "warning",
      "Carry-over about to expire",
      `${risk} carry-over days across ${plural(o.carryover_expiry.users_affected, "person", "people")} expire within ${o.carryover_expiry.window_days} days.`,
      "/admin/leave-balances?expiring=1",
      "See balances"
    );

  const pc = o.period_close;
  if (pc.tls_open > 0)
    add(
      "period-open",
      pc.tls_open,
      pc.tls_open * 2 > pc.tls_total ? "warning" : "info",
      `Period ${pc.period} not closed`,
      `${pc.tls_open} of ${pc.tls_total} team leaders have not closed the period.`,
      "/admin/overtime-logs",
      "Review"
    );

  if (o.backup && (o.backup.count === 0 || o.backup.stale))
    add(
      "backup-stale",
      o.backup.count,
      "critical",
      o.backup.count === 0 ? "No site backup exists" : "Site backup is stale",
      o.backup.count === 0
        ? "No backup has been taken yet."
        : "The latest backup is more than 7 days old.",
      "/admin/backup-restore",
      "Open backups"
    );

  if (out.length === 0)
    add("all-clear", 0, "positive", "All clear", "No open issues need attention right now.");

  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}
