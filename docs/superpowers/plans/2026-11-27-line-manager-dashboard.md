# Line Manager dashboard: decisions and plan (2026-11-27)

Branch `fix/tl-dashboard-graphs`. Owner report: "Why Line manager dashboard doesn't update graphs?". Uncommitted part 1 (done, verified in vitest, Django and the browser): the dashboard no longer sends `team_id`, and the approval hooks (`useApprovalMutations`, `useTLBulkMutations`, the bundled standby day in `TeamManagementPage`, `useEventActions`) invalidate `["dashboard"]`. Status: built and merged on 2026-11-27 (owner go). Added during the browser pass: the bundled standby reject on the Team page now closes its dialog. Not run: Playwright e2e, `graphify update`.

## Code facts checked before deciding (item 22)

- `apps/dashboard/viewsets.py` `_get_team_and_members` always adds the viewer (`team_member_ids.add(user.id)`).
- `pending_trend` counts **pending** rows whose work date is in `[today-13, today]`, and leave by overlap. `monthly_comparison` counts **pending** rows whose work date is in this or the previous month/week, and leave by overlap. `top_pending_users` counts every pending row. None of the three applies `owned_by_leader_q`. `team_stats` and `queue_highlights` do.
- `owned_by_leader_q` never gives a leader their own pending overtime or standby, because that row belongs to the viewer's own leader. Leave has no owner rule; it follows the current link (item 82).
- `PermissionService.can_approve` (SEC-09) refuses a leader's own leave. That is why the dashboard queue offers Approve on the viewer's own leave and the API answers 403.
- `submitted_at` exists on overtime, standby and leave. On leave it is nullable for legacy rows. A resubmitted overtime or standby row gets a new `submitted_at`.
- Shared `useBulkOperations` only calls `refetchQueries({queryKey})`. As a result, these paths still leave the dashboard stale: **checkbox bulk approve/reject/delete on the Team page** (`useTeamBulkActions`), bulk delete on `OvertimePage`, admin `useHoursLogsBulk`/`LeaveRequestsPage`, and the single admin approve/reject (`useOvertimeLogsPage`, `useStandbyLogsPage`, `LeaveRequestsPage`, `useAdminRejectMutation`).
- The dashboard queries use `refetchOnWindowFocus: false`. `FRESH_MS = 60_000` lives in `hooks/useAdminDashboardQueries.ts` (the item 39 exception).

## Decisions

**D1. Every dashboard figure counts the same rows as the queue.**
- **Pending Trend** is renamed **"Open queue by submission date"**. It shows the rows that are pending now, bucketed by the Europe/Tirane date of `submitted_at` (leave: `Coalesce(submitted_at, created_at)`) over the last 14 days. Rows submitted earlier fold into the first point, with `includes_earlier: N`. The sum of the points equals the Queue Mix total and the `team_stats` pending total, and future-dated requests appear.
- **Monthly Comparison** is renamed **"Requests received"**. It counts requests of any status submitted in this period against the previous period, by `submitted_at`. Each leave request counts once.
- All three actions (`pending_trend`, `monthly_comparison`, `top_pending_users`) apply `owned_by_leader_q` for leader scope, as `team_stats` does.
- Rejected:
  - Widening the date window into the future: it still hides older pending rows, and an axis that runs into the future is confusing.
  - A real backlog-over-time series: decision times are not reliable for every model (reject time, resubmissions), so the history would contain invented numbers.
  - Relabelling only: the numbers would still disagree with Queue Mix.
- Known limit: imported rows count on their import day.

**D2. An open dashboard refreshes on window focus once 60 s old**, as the admin headline queries do (item 39). Implementation: move `FRESH_MS` into a shared `lib/queryFreshness.ts`, then set `refetchOnWindowFocus: true` on the four Line Manager queries; the queue keeps `staleTime: 0`. Every request-mutating path also invalidates `["dashboard"]`, which covers changes made in this tab.
- Rejected:
  - Polling: it puts constant load on the server for every open tab, and nothing on this page needs updates faster than once a minute.
  - Refresh driven by notifications: it couples a core page to the notifications plugin, which breaks plugin-removal safety. This stays a later candidate.

**D3. The viewer is removed from the dashboard roster in every scope** (delete the self-add). Reasons:
- The viewer's own leave cannot be decided (SEC-09).
- The viewer's own overtime and standby are already excluded by the owner rule.
- The self-add inflates `team_size`, `active_operator_count`, Top pending and every chart.
- Removing the viewer narrows scope and never widens it, so team confidentiality (2026-10-20) holds.
- The viewer's own requests stay on My Records and their own pages.
- Rejected:
  - Keeping the viewer and hiding Approve: the counts stay inflated.
  - Excluding only the viewer's leave: `team_size` stays wrong.

**D4. The subtitle becomes "Managing N direct reports"** ("1 direct report" in the singular), with no team name. Teams are calendar data (item 64) and do not define the scope. Rejected: listing every team (long, and wrong for the same reason) and keeping the first team (misleading).

## Plan (TDD: each test fails first)

Files:
- `apps/dashboard/viewsets.py`, `apps/dashboard/tests/test_widget_team_scope.py`, `apps/dashboard/tests/test_team_leader_widgets.py`, `apps/reports/test_export_integrity.py`
- `frontend/src/hooks/useBulkOperations.ts`, `useAdminRejectMutation.ts`, `useTeamLeaderDashboardData.ts`, `useAdminDashboardQueries.ts`, new `lib/queryFreshness.ts`
- `pages/admin/hooks/useOvertimeLogsPage.ts`, `useStandbyLogsPage.ts`, `pages/admin/LeaveRequestsPage.tsx`
- `pages/dashboard/TeamLeaderDashboard.tsx`, `components/PendingTrendCard.tsx`, `MonthlyComparisonCard.tsx`
- New `src/test/dashboardInvalidation.guard.test.ts`

Steps:

1. **Backend D3.** Tests: the viewer's own pending leave is absent from `queue_highlights`, `top_pending_users` and the counts; `team_size` excludes the viewer. Update the two pinned expectations (`test_shared_team_without_tl_link…` 2→1, `test_staff_and_hr…` 2→1). Remove the self-add.
2. **Backend D1.** Tests:
   - A future-dated pending leave appears in the trend.
   - The sum of the trend equals the `team_stats` pending total.
   - A row submitted 20 days ago lands in the first point with `includes_earlier`.
   - Each figure counts only owned rows: the `LeaderWithHrRoleOwnerScopeTests` cases extended to the three actions.
   - Comparison counts a leave once and buckets by `submitted_at` at the month boundary (23:30 on the 31st in Tirane).
   - Implement with one `values().annotate()` query per model, as the code does today.
3. **Integrity.** Add `DashboardIntegrityTests` cases in which a leader's trend and comparison equal direct `submitted_at` queries on the source tables, on the edge-case month: shared paid hour, boundary leave, half day, rejected/pending, next-month row.
4. **Frontend invalidation.** `useBulkOperations` and `useAdminRejectMutation` also invalidate `["dashboard"]`, and so do the three admin single approve/reject handlers. Unit tests per hook.
5. **Guard test.** Any file that calls `(overtime|standby|leave)Service.(approve|reject|bulkApprove|bulkReject|bulkDelete|deleteLog|deleteRequest)` or `useBulkOperations(` must contain a `["dashboard"]` invalidation or appear on a reasoned allow-list (the service files, `useLeaveBalances`, `useClientManagement`). The test fails today on `useTeamBulkActions` through `useBulkOperations`, and on the admin hooks.
6. **D2.** Test that the hook's queries carry `refetchOnWindowFocus: true` and `staleTime: FRESH_MS`. Admin queries import the shared constant, with no behaviour change.
7. **D4 and labels.** Update the `TeamLeaderDashboard` test for the subtitle and singular. Card titles and descriptions become: "Open queue by submission date / Pending requests, by the day they were submitted"; "Requests received / This vs previous month (or week), any status". The tooltip shows "includes N submitted earlier". Run `ux-writing` on the copy.
8. **Docs:**
   - Add `docs/workflow-invariants.md` **item 93**: dashboard figures share the queue's roster and owner rule, the viewer is excluded, the trend and comparison definitions, focus refresh, and "every request-mutating path invalidates `["dashboard"]`; the guard is the enforcer". Add a cross-reference in item 39.
   - In `CLAUDE.md` Hot Invariants, extend the item 82 (l) bullet with the viewer exclusion and the owner rule on all five actions, and add the invalidation rule.
   - In the `CLAUDE.md` Task Router, add "Line Manager dashboard, team dashboard, pending trend, monthly comparison, queue mix, `["dashboard"]` invalidation → item 93".

## Verification (also finishes part 1's NOT RUN items)

- Targeted: `py -3.14 manage.py test apps.dashboard apps.reports.test_export_integrity apps.permissions.test_row_ownership_matrix`; `npx vitest run src/hooks src/pages/dashboard src/pages/team src/pages/admin src/components/calendar src/test`.
- Full, once: `makemigrations --check`, the full `manage.py test` (simulation gates included), ruff on the changed `.py` files, `npx tsc --noEmit`, the full `vitest run`, `npm run build`, `node scripts/control-audit.mjs --strict --exclude=src/plugins/engagement`, and `node scripts/surface-audit.mjs` (same flags).
- E2E: delete `db.e2e.sqlite3`, then run `migrate` and `prepare_e2e_db` (`settings_e2e`), then the full Playwright run. Any failure is rerun alone on fresh data and on `main`.
- Browser (Frontend gate, local review stack: backend 8011, frontend on **3000** with `VITE_API_URL=http://localhost:8011/api`, because 5173 and 5174 may be held):
  - As an employee, create a future-dated leave, then focus the Line Manager tab. Queue Mix and the trend sum must agree.
  - Approve from each of these, and the dashboard must move without a reload each time:
    - dashboard queue
    - Team page row
    - Team page checkbox bulk
    - bundled standby day approve and reject
    - calendar event modal
    - TL approval page
  - The viewer's own leave is absent, and the subtitle is correct.
  - Check light and dark at 1440, 768 and 320 px with no sideways overflow, zero console errors and 2xx network responses.
- `graphify update .` in a checkout that has `graphify-out/` (this worktree has none).
- No commit or push without the owner's word.
