import { describe, it, expect } from "vitest";
import type { AdminOverview } from "@/types";
import { deriveAdminInsights } from "./adminInsights";

const clean = (): AdminOverview => ({
  headcount: {
    total_users: 10,
    active_users: 10,
    inactive_users: 0,
    new_hires_30d: 0,
    never_logged_in: 0,
  },
  coverage_gaps: {
    teams_without_leader: 0,
    users_without_team: 0,
    users_without_tech: 0,
    employees_without_tl: 0,
    al_tls_without_hbpr_assignment: 0,
  },
  pending_backlog: {
    overtime: { count: 0, hours: 0 },
    standby: { count: 0, hours: 0 },
    leave: { count: 0, days: 0 },
  },
  approval_aging: {
    buckets: ["0-3d", "4-7d", "8-14d", "15d+"],
    overtime: [0, 0, 0, 0],
    standby: [0, 0, 0, 0],
    leave: [0, 0, 0, 0],
  },
  leave_utilization: {
    year: 2026,
    total_days: 0,
    used_days: 0,
    pending_days: 0,
    available_days: 0,
    utilization_pct: null,
  },
  carryover_expiry: { window_days: 60, days_at_risk: 0, users_affected: 0 },
  period_close: { period: "2026-09", tls_total: 4, tls_closed: 4, tls_open: 0, open_tls: [] },
  backup: null,
});

describe("deriveAdminInsights", () => {
  it("returns only all-clear for a healthy org", () => {
    const out = deriveAdminInsights(clean());
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "all-clear", severity: "positive" });
    expect(out[0].to).toBeUndefined();
  });

  it("grades the 15d+ bucket critical at 5 and warning at 4, routed to the largest type", () => {
    const o = clean();
    o.approval_aging.standby = [0, 0, 0, 4];
    let out = deriveAdminInsights(o);
    expect(out[0]).toMatchObject({
      id: "aging-stale",
      severity: "warning",
      to: "/admin/standby-logs?status=pending",
    });
    o.approval_aging.leave = [0, 0, 0, 1];
    out = deriveAdminInsights(o);
    expect(out[0]).toMatchObject({
      severity: "critical",
      to: "/admin/standby-logs?status=pending",
    });
    o.approval_aging.leave = [0, 0, 0, 9];
    expect(deriveAdminInsights(o)[0].to).toBe("/admin/leave-requests?status=pending");
  });

  it("emits one insight per rule, ordered critical, warning, info", () => {
    const o = clean();
    o.approval_aging.overtime = [0, 0, 0, 6];
    o.coverage_gaps.teams_without_leader = 2;
    o.coverage_gaps.employees_without_tl = 1;
    o.coverage_gaps.al_tls_without_hbpr_assignment = 1;
    o.carryover_expiry.days_at_risk = 3.25;
    o.period_close = { period: "2026-09", tls_total: 6, tls_closed: 5, tls_open: 1, open_tls: [] };
    const out = deriveAdminInsights(o);
    expect(out.map((i) => i.id)).toEqual([
      "aging-stale",
      "gap-team-leader",
      "gap-employee-tl",
      "gap-hbpr",
      "carryover-risk",
      "period-open",
    ]);
    const rank = { critical: 0, warning: 1, info: 2, positive: 3 } as const;
    const ranks = out.map((i) => rank[i.severity]);
    expect([...ranks].sort()).toEqual(ranks);
    expect(out.find((i) => i.id === "all-clear")).toBeUndefined();
    expect(out.find((i) => i.id === "period-open")?.severity).toBe("info");
  });

  it("period-open is a warning only when more than half the TLs are open", () => {
    const o = clean();
    o.period_close = { period: "2026-09", tls_total: 4, tls_closed: 2, tls_open: 2, open_tls: [] };
    expect(deriveAdminInsights(o)[0].severity).toBe("info");
    o.period_close = { period: "2026-09", tls_total: 4, tls_closed: 1, tls_open: 3, open_tls: [] };
    expect(deriveAdminInsights(o)[0].severity).toBe("warning");
  });

  it("never reports a backup insight when backup is null (non-superuser)", () => {
    expect(deriveAdminInsights(clean()).some((i) => i.id === "backup-stale")).toBe(false);
  });

  it("flags no backups and stale backups as critical", () => {
    const o = clean();
    o.backup = { count: 0, last_created_at: null, age_hours: null, size_mb: null, stale: true };
    expect(deriveAdminInsights(o)[0]).toMatchObject({
      id: "backup-stale",
      severity: "critical",
      to: "/admin/backup-restore",
    });
    o.backup = { count: 2, last_created_at: "x", age_hours: 300, size_mb: 1, stale: false };
    expect(deriveAdminInsights(o)[0].id).toBe("all-clear");
  });

  it("changes the signature when the underlying number changes", () => {
    const o = clean();
    o.approval_aging.overtime = [0, 0, 0, 3];
    const a = deriveAdminInsights(o)[0].signature;
    o.approval_aging.overtime = [0, 0, 0, 7];
    const b = deriveAdminInsights(o)[0].signature;
    expect(a).toBe("aging-stale:3");
    expect(b).toBe("aging-stale:7");
  });

  it("points carry-over at the expiring filter", () => {
    const o = clean();
    o.carryover_expiry.days_at_risk = 2;
    expect(deriveAdminInsights(o)[0].to).toBe("/admin/leave-balances?expiring=1");
  });
});
