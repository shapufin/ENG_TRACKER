import type { AdminOverview, AdminPeople, AdminTrends } from "@/types";

const zeros = () => Array(12).fill(0) as number[];

const MONTHS = [
  "2025-11",
  "2025-12",
  ...Array.from({ length: 10 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`),
];

/** Test fixture: a plausible 12-month trends payload (latest month = 2026-10). */
export const makeTrends = (over: Partial<AdminTrends> = {}): AdminTrends => {
  const ot = zeros();
  ot[11] = 12.5;
  const sb = zeros();
  sb[11] = 16;
  return {
    months: MONTHS,
    hours: { overtime: ot, standby: sb, pending_overtime: zeros() },
    leave_days: { vacation: zeros(), sick: zeros() },
    overtime_by_client: [
      { client_id: 1, name: "Acme", hours: 10, share_pct: 80 },
      { client_id: null, name: "Other", hours: 2.5, share_pct: 20 },
    ],
    team_comparison: [
      {
        team_id: 1,
        name: "Core",
        team_size: 2,
        overtime_hours: 10,
        standby_hours: 8,
        leave_days: 3,
        overtime_per_capita: 5,
      },
      {
        team_id: 2,
        name: "Empty",
        team_size: 0,
        overtime_hours: 0,
        standby_hours: 0,
        leave_days: 0,
        overtime_per_capita: null,
      },
    ],
    who_is_out: {
      date: "2026-10-08",
      on_leave: [
        {
          user_id: 1,
          name: "Ana Lee",
          team: "Core",
          request_type: "vacation",
          until: "2026-10-10",
        },
      ],
      on_standby: [{ user_id: 2, name: "Bo Kim", team: null }],
      upcoming_leave_14d: 3,
    },
    ...over,
  };
};

export const makePeople = (over: Partial<AdminPeople> = {}): AdminPeople => ({
  roles: {
    italian_tl: 3,
    albanian_tl: 2,
    hr: 1,
    hbpr: 1,
    staff: 2,
    employees: 30,
    employees_without_tl: 4,
  },
  techs: [
    {
      tech_id: 1,
      name: "NOC",
      count: 5,
      levels: [
        { code: "L1", name: "Junior", rank: 1, count: 3 },
        { code: null, name: "Ungraded", rank: 0, count: 2 },
      ],
    },
  ],
  approver_sla: [
    {
      user_id: 3,
      name: "Ana Lee",
      decisions_30d: 21,
      approval_rate_pct: 90.5,
      avg_decision_hours: 14.2,
    },
  ],
  rejections: {
    month: "2026-10",
    by_type: { overtime: 2, standby: 0, leave: 1 },
    top_reasons: [{ reason: "missing ticket", count: 2 }],
  },
  ...over,
});

/** Test fixture: a plausible overview payload. */
export const makeOverview = (over: Partial<AdminOverview> = {}): AdminOverview => ({
  headcount: {
    total_users: 40,
    active_users: 36,
    inactive_users: 4,
    new_hires_30d: 3,
    never_logged_in: 5,
  },
  coverage_gaps: {
    teams_without_leader: 2,
    users_without_team: 1,
    users_without_tech: 0,
    employees_without_tl: 3,
    al_tls_without_hbpr_assignment: 1,
  },
  pending_backlog: {
    overtime: { count: 4, hours: 12.5 },
    standby: { count: 2, hours: 16 },
    leave: { count: 3, days: 9 },
  },
  approval_aging: {
    buckets: ["0-3d", "4-7d", "8-14d", "15d+"],
    overtime: [1, 1, 1, 1],
    standby: [0, 0, 0, 2],
    leave: [1, 1, 1, 0],
  },
  leave_utilization: {
    year: 2026,
    total_days: 200,
    used_days: 50,
    pending_days: 10,
    available_days: 140,
    utilization_pct: 25,
  },
  carryover_expiry: { window_days: 60, days_at_risk: 11.5, users_affected: 4 },
  period_close: {
    period: "2026-09",
    tls_total: 6,
    tls_closed: 4,
    tls_open: 2,
    open_tls: [
      { id: 1, name: "Ana TL" },
      { id: 2, name: "Beni TL" },
    ],
  },
  backup: {
    count: 3,
    last_created_at: "2026-09-20T10:00:00Z",
    age_hours: 400,
    size_mb: 12.5,
    stale: true,
  },
  ...over,
});
