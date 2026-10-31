# Full audit, 2026-10-31 (window 7ee8868..8857d0d)

Baseline: backend 3987 tests, frontend 3933 tests, tsc/check/makemigrations clean. Browser render gates not run (no browser installed).

## Resolved
- MEDIUM, reports: `.exclude(user__is_staff=True, user__is_superuser=True)` drops only users that are BOTH, so staff-only admins stayed in report and insight figures (standby 14h instead of 4h in the repro). Fixed with `apps/users/services/workforce.py` (`workforce_filter`, positive kwargs) used by `UnifiedReportFilter`, `InsightsView` balances and `hr_overview`.
- MEDIUM, HR dashboard: `month_avg_overtime_hours` mixed all approved hours with the active-account count; now workforce on both sides. Recent hours, pending leave and the monthly series use the same rule.

## Disproved
- `assignment_counts` leaking company totals: non-HR roles are scoped to their own profile by `filter_for_regular_user`; a guard test now pins it.

## Backlog
- LOW: `non_team_user_q` matches `role_codes__icontains='hr'` (substring); safe for current codes.
- LOW: `tech_facets` passes `permission_classes=[IsAuthenticated()]` (instances) in its decorator; predates this window.
- Rule: `exclude(a=1, b=1)` is NOT(a AND b); use `workforce_filter` for "who counts as staff of the org".
