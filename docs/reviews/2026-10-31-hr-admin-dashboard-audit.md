# HR + Admin dashboards — audit record (2026-10-31)

Full audit of the HR dashboard's data population and the admin dashboard's field population,
fixes on `audit/hr-admin-dashboards-2026-10-31` (base `main` @ `111581d`). Scope:
`apps/dashboard/*` aggregates, the HR dashboard data path (`useDashboardData`, `HRDashboard*`
components), the admin dashboard widget queries, and the API contracts both consume.
Risk-ranked data-integrity first. Full finding tables:
`.devin/audits/hr-admin-dashboards-2026-10-31/round-1.md` (local-only, not tracked).

## Result

2 CRITICAL / 3 HIGH / 4 MEDIUM / 4 LOW found; **12 fixed** (2 commits), 1 LOW deferred to
`docs/backlog.md`. No claim was disproved — every finding was proven by code quote and/or a live
probe (curl + browser) before fixing.

## Root cause

The HR dashboard's OT/standby widgets read the **personal** self-service list endpoints:
pure-HR viewers were 403'd (`HrOnlyBlockedMixin`), multi-role HR/staff got own-scope rows
(`PersonalOnlyFilterMixin`, `allow_staff_global_view=False`), and every viewer got a
current-month-only window (`_apply_date_filter`). Live proof: `e2e_hr` saw an empty chart and
tables with Approved=0 while the org had 46 pending / 36 approved requests.

## Fixed

| Finding | Severity | Fix | Test |
|---|---|---|---|
| OT/SB widgets structurally empty for pure HR (403 on every action, incl. `admin_logs` whose docstring names HR) | CRITICAL | `1b45ea4` — new `hr_overview` widget endpoint (`IsHR`) returns stats, org status counts, 6-month approved series, recent rows, pending leave | `test_hr_overview.py` (11 tests) |
| Multi-role HR/staff saw their own personal logs labeled "across all teams" | CRITICAL | `1b45ea4` + `342a022` — dashboard reads `hr_overview` for every HR viewer; personal endpoints no longer fire on the HR view | `useDashboardData.test.ts` "hr dashboard reads the org aggregate" |
| Current-month default silently drops history | HIGH | `342a022` — the org series is computed server-side; the HR view no longer uses month-capped lists | same |
| Request Pipeline mixed scopes (Pending org-wide, Approved/Rejected from ≤50 personal rows) | HIGH | `342a022` — all three bars from one `status_counts` | `HRDashboardCharts` + hook tests |
| "Overtime Distribution" chart was ≤6 unsorted personal days, labeled a company daily average | HIGH | `342a022` — real 6-month approved OT+SB series, relabeled "Approved Hours" | hook test asserts the series mapping |
| Pending-leave grid could falsely claim "All processed" (client-side filter of page 1) | MEDIUM | `342a022` — server-filtered `status=pending`, oldest first, true total badge | `HRDashboardPendingLeave.test.tsx` |
| Fabricated trend chips (`+12%`, `+5`, `+2`, `Stable`) | MEDIUM | `342a022` — removed | stats tests |
| `global_stats` counted soft-deleted rows; avg OT divided by all accounts | MEDIUM | `1b45ea4` — `is_deleted=False` everywhere, denominator = active users, `active_users` added | `test_hr_overview.py` soft-delete case |
| `_team_comparison` double-counted multi-team users' hours/leave | MEDIUM | `1b45ea4` — one canonical team per user (same rule as `_team_names`) | `test_admin_trends.py` |
| `_who_is_out` listed deactivated users' approved rows | MEDIUM | `1b45ea4` — `user__is_active=True` | `test_admin_trends.py` |
| `global_stats` fired even with no consuming widget on the admin layout | LOW | `342a022` — gated on kpi-strip / approval-queue in the saved layout | `useAdminDashboardPage.test.tsx` |
| Admin "Users" KPI counted inactive accounts vs active-based counts elsewhere on the page | LOW | `342a022` + review pass — KPI and HR Workforce read `active_users` | `KpiStripWidget.test.tsx` |

### Follow-up pass (review of the fixes themselves)

| Finding | Severity | Fix | Test |
|---|---|---|---|
| The **personal** dashboard still emptied on the 1st of every month (month-default date filter) — flagged at review, not part of the original scope | LOW | dashboard recent-list calls pass `ignore_date_filter=true` (latest rows regardless of month) | `useDashboardData.test.ts` "asks for the latest rows regardless of month" |
| No browser test covered the bug class itself (frontend wired to the wrong endpoint; all unit tests mock the service, so they were green before and after the bug) | LOW | `e2e/hr-dashboard.spec.ts` — asserts the rendered pipeline/chart/recents against `hr_overview` **and** that the personal list endpoints never fire | e2e chromium, 1 passed |
| Dead imports from the refactor (`models` in `viewsets.py`, `_month_start` in `hr_overview.py`); HR Workforce tile still read `total_users` | LOW | `ae24dab` | ruff + `HRDashboardStats.test.tsx` |
| Three endpoints each computed the same request counts (`global_stats`, `admin_overview.pending_backlog`, `admin_overview.approval_aging` buckets) — the KPI strip, aging chips and aging buckets could silently disagree | MEDIUM | `apps/dashboard/aggregates.py` — `status_counts()` is the single implementation (counts + approved/pending hours in one aggregate per model); every dashboard endpoint derives from it | `test_status_counts.py` (5 agreement tests) |
| `GlobalSettingsPage` 2FA test flaked at the 5 s default under full-suite load (pre-existing, reddened CI at random) | LOW | 15 s per-test budget on the page-level render, with a comment explaining why | file passes 11/11 isolated |

## Gates after the fixes

Backend: `apps.dashboard` **220 OK** (209 baseline + 11 new); affected-apps gate
(`dashboard overtime standby leave_management users permissions`) **1299 OK**;
`makemigrations --check` clean; ruff clean on touched files.
Frontend: full suite **3898 / 3899** (606 files) — the one failure is
`GlobalSettingsPage.test.tsx` 2FA timing out at 5 s under full-suite load, **passes 11/11 in
isolation** and touches none of the changed code (pre-existing flake, not a regression).
`tsc -b` clean, eslint clean on touched files.

Browser post-fix as `e2e_hr`: Approved 0 → 36, populated chart (May–Oct OT+SB), populated
Recent OT/SB tables, 8 pending leaves with the true total, no fabricated chips. Admin dashboard
re-checked as `e2e_admin`: every widget and every tab (Status/Aging/Speed, Roles/Tech,
This month/Trend) still populates.

## Process notes

- `admin_logs`' docstring admits HR but `HrOnlyBlockedMixin` 403s pure HR before the action runs.
  Left as-is deliberately: the dashboard needs aggregates + recents, not raw list access
  (least privilege). Revisit only if an HR page needs the raw queue.
- `is_deleted` is barely exercised outside tests today (all delete paths hard-delete); the new
  filters are invariant-alignment, not a visible-bug fix.
- The `.devin/audits` folder is gitignored; this file is the tracked record.
