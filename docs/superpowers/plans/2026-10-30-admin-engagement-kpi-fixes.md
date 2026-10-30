# Admin dashboard hours, Engagement clarity, IT TL out of Ticket KPI

Source: Gemini audit `full_audit_findings.md` (re-verified 2026-10-30 against code and a live browser
on the e2e DB) and `docs/audits/2026-10-30-admin-dashboard-engagement-kpi-audit.md`.
Branch: new branch off `main` per phase (see `feedback_new_branch`). Tests: `py -3.14 manage.py test ...`.

## Primary goal

An admin who looks at "This month" sees this month's numbers and nothing else; a TL reads the
Engagement page and knows what a breach is without asking; a TL's Ticket KPI lists only the people
they measure, never the Italian TLs above them.

## Verification of the audit (what stood, what did not)

| # | Audit claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Hours "This month" shows lifetime hours | CONFIRMED | `global_stats` aggregates `OvertimeLog`/`StandbyLog` with no date filter (`apps/dashboard/viewsets.py:171-184`); `hoursData` is built from it (`hooks/adminDashboardSummary.ts:38-41`). Live: chart 35.0h OT / 39.0h SB while the "Overtime by Client" and "Team Comparison" cards on the same page, both this month, sum to 28h. After seeding 4h+3h in older months the gap was exactly 7h |
| 1b | (missed) | NEW | The KPI strip "Overtime / This month" card has the same bug: `overtimeHours` comes from `overtimeSummary.total_hours` = `total_overtime_hours` (`AdminDashboardWidgets.tsx:145`, `KpiStripWidget.tsx:133-136`). Live it read 35h. `avg_overtime_hours` is lifetime / total users, also not a monthly figure |
| 2 | Graphs stale: `staleTime` 5 min, `refetchOnWindowFocus: false` | TRUE BUT MINOR | `useAdminDashboardQueries.ts:12-49`. The "unresponsive" symptom is mostly #1; admin mutations already call `invalidateAdminDashboard`, so only changes made elsewhere (a TL approving) wait up to 5 min |
| 3 | Breach/TTA meaning unclear, add "!" guide | CONFIRMED, wording corrected | No guide exists. Score weights 40/20/20/20 are `COMPONENT_WEIGHTS` (`plugins/engagement/services.py:38`); `breaches = judgeable - on_time` (`:408`). The page has no "Breaches" KPI card: breach shows only in the red banner ("33 request(s) past their deadline...") and a table column; TTA shows as "0.58h avg" under Approval Rate and in the chart legend. The audit's "Breaches: 7" card does not exist in this build |
| 4a | `TTATrendChart` Y-axis label collides with ticks | NOT REPRODUCED | At 1440px "Score"/"Hours" sit clear of the ticks (`margin left:0` is tight but legible). Low value; do only as part of 4b if a collision shows |
| 4b | Charts collapse to `aspect-video` in the 2-col grid | PARTLY TRUE | `TTATrendChart` is already `h-[280px] sm:h-[350px]`. The two small charts are `ChartContainer` (`aspect-video`, `max-h-[320px]`): 505x284 at 1440px but 297x167 at 1024px. `EngagementVisualizationPage.tsx:215` already uses the `aspect-auto h-full` pattern |
| 5 | IT TLs appear in Ticket KPI team scope | CONFIRMED | `_get_tl_team_members` (`plugins/ticket_kpi/viewsets.py:1493-1504`) returns `get_team_member_ids() \| {self}`. Live (e2e): the other IT TL appears in KPI scope but not in `matrix_user_ids` |
| 5b | Fix = copy the `Q(...)` block from the Skills plugin | REJECTED | `team_query.py` is a plugin; `ticket_kpi` importing it breaks "core never references a plugin" and copying breaks "import core helpers, don't copy" (CLAUDE.md plugin audit checklist). Lift the definition to core (`UserProfile.is_italian_tl`, `apps/users/models/core.py:692`, is the existing definition) and have both plugins call it |

Not verified: the production numbers (675h/8,805h, "7 breaches") — there is no prod access; the e2e DB reproduces the mechanism, not the figures.
Open watch item (not a bug yet): as admin, two TLs of the same team each show the same 15 breaches, and the banner sums them (33). Confirm with the owner whether the banner should de-duplicate by request.

## Phase 0: Documentation and API discovery (done)

**How this serves the primary goal:** it stops the fixes from inventing endpoints or copying a cross-plugin import.

Allowed APIs (all read this session):
- `build_admin_trends(user, today, months)` returns `months[]` and `hours.{overtime,standby,pending_overtime}` as per-month lists; the last item is the current business month (`apps/dashboard/admin_trends.py:52-60, 204-221`). `_monthly_hours` is the only monthly-sum helper.
- `useAdminTrends(enabled, months)`, `useAdminOverview(enabled)` (`hooks/useAdminDashboardQueries.ts`); `invalidateAdminDashboard(qc)` (`lib/adminDashboardKeys.ts`).
- `UserProfile.is_italian_tl` / `is_albanian_tl` (`apps/users/models/core.py:685-692`); `matrix_user_ids` (`plugins/skills/services/team_query.py:36`) is the behavior to match.
- `COMPONENT_WEIGHTS`, `AGING_BUCKETS`, `_aging_bucket` in `plugins/engagement/services.py`; deadlines in `docs/engagement-metrics.md`.
- Dialog contract: `DialogContent size="md"`, `DialogBody`, tone tokens (CLAUDE.md Dialog contract; `node scripts/modal-audit.mjs`).
Anti-patterns: do not add a date filter to `global_stats` (other callers use the lifetime totals); do not add a `LeaveType`-style new model; do not import `plugins.skills` from `plugins.ticket_kpi`; do not use `prompt()`/`confirm()`; no hard-coded weights in the UI copy (read them from one exported constant or the API).

## Phase 1: Admin dashboard shows real "this month" hours

**How this serves the primary goal:** this is the "This month shows this month" half, and it covers the KPI card the audit missed.

Do:
- Backend: add one helper in `apps/dashboard/admin_trends.py` returning current-month approved overtime and standby hours (same window as `_monthly_hours`, business month via `business_today()`); expose it from `admin_overview` and reuse it in `build_admin_trends` so the two can never disagree. Read `apps/dashboard/admin_overview.py` first and add the field beside the existing counters.
- Frontend: build `hoursData` and the KPI `overtimeHours` from that field, not from `global_stats`; delete the `overtimeSummary`/`hoursData` derivation from `adminDashboardSummary.ts` once unused (YAGNI). Keep `global_stats` untouched.
- Tests first: a Django test with approved hours in an old month and this month asserting only this month is returned; update `adminDashboardSummary.test.ts`, `HoursTrendWidget.test.tsx`, `AdminDashboardPage.test.tsx`.
Verify: `py -3.14 manage.py test apps.dashboard`; `cd frontend && npx vitest run src/hooks src/pages/admin && npx eslint src/pages/admin src/hooks`; browser on the e2e DB (seed script: approved hours 100/70 days ago plus this month): chart, KPI card, "Overtime by Client" and "Team Comparison" agree.
Guard: grep `total_overtime_hours` in `frontend/src/pages` returns nothing.

## Phase 2: Admin queries refresh when the tab regains focus

**How this serves the primary goal:** a TL's approval elsewhere reaches the admin's open dashboard without a 5-minute wait.

Do: in `useAdminDashboardQueries.ts` set `refetchOnWindowFocus: true` and `staleTime: 60_000` for overview, trends, people and global-stats only. This breaks the app-wide `refetchOnWindowFocus: false` convention on purpose, so record it in CLAUDE.md next to the plugin-metadata exception.
Verify: a vitest asserting the options; manual: change data via API, refocus the tab, number updates. Guard: no other hook file changes its focus policy.

## Phase 3: Engagement metrics guide ("!" dialog)

**How this serves the primary goal:** this is the "knows what a breach is" half.

Do: add an info button beside "Export Report" in `EngagementMetricsPage.tsx` that opens a `DialogContent size="md"` with: the four score parts and weights, TTA (average time from submission to decision), the aging buckets, the SLA table, what counts as a breach (decided late or still pending past the deadline), and the two evidence-only signals. Pull weights and bucket labels from one shared constant mirrored from `COMPONENT_WEIGHTS`/`AGING_BUCKETS` (expose through the existing summary payload if it is not already there; otherwise a frontend constant with a test pinning it to `docs/engagement-metrics.md`). Give the button an `aria-label`; wire the red banner and the table's "Breaches" header to the same dialog as an extra entry point. Wording through the `ux-writing` skill.
Verify: `npx vitest run src/plugins/engagement`; `node scripts/modal-audit.mjs`; browser: open, Esc closes, keyboard focus returns to the button, 375px and light/dark.
Guard: no `title`-only tooltip as the sole explanation; no `dark:` colour classes.

## Phase 4: Chart sizing at laptop widths

**How this serves the primary goal:** the Engagement charts stay readable on a 1024-1280px laptop, which is where the guide will be read.

Do: in `ScoreCompositionTrendChart`, `RequestVolumeChart` and `TeamComparisonChart` pass `aspect-auto h-[280px] w-full` instead of `max-h-[...]` (copy the pattern at `EngagementVisualizationPage.tsx:215`). Touch `TTATrendChart` margins only if the label collides after a screenshot at 1024px.
Verify: browser at 1024 and 1440: container heights are 280px (were 167 at 1024); `npx vitest run src/plugins/engagement`.
Guard: do not change `components/visualization/chart.tsx`'s default `aspect-video`; other pages rely on it.

## Phase 5: Italian TLs out of Ticket KPI team scope

**How this serves the primary goal:** this is the "never the Italian TLs above them" half.

**Decided 2026-10-30: option A.** (A) exclude other IT TLs but keep the requester's own row, preserving the docstring at `viewsets.py:1496-1500` and an IT TL's own upload; (B) exclude all IT TLs including self, as the skills matrix does.
Do (TDD): 1) a core helper (one function beside `UserProfile.is_italian_tl`, same definition as `matrix_user_ids`) returning Italian-TL user ids; 2) `matrix_user_ids` calls it; 3) `_get_tl_team_members` excludes those ids per the decision. Update `plugins/ticket_kpi/test_ticket_kpi.py::test_get_tl_team_members_returns_users_including_self` and `test_core_coupling.py` (it pins equality with `get_team_member_ids()`; make it "equal minus Italian TLs"). Check all 11 call sites (`viewsets.py:771, 800, 1123, 1186, 1263, 1682, 1700, 1950, 1954, 2239, 2320`): authorization callers must not lose access they need (`_is_tl_for_user` is separate and stays).
Verify: `py -3.14 manage.py test plugins.ticket_kpi plugins.skills`; e2e DB check: `e2e_tl_b` and `e2e_tl` show no `e2e_tl_hr`; `get_change_impact` on the helper.
Guard: no `except Exception`; `plugins/ticket_kpi` must not import `plugins.skills` (`test_core_coupling` pins it).

## Phase 6: Docs and workflow

**How this serves the primary goal:** the next session reads the rule, not the bug.

Do, in the same PRs as the code (docs never describe unmerged behavior):
- `docs/workflow-invariants.md`: new numbered item "Admin dashboard figures labelled 'this month' read the monthly series, never `global_stats`"; extend the Plugin audit checklist with "an Italian-TL exclusion lives in one core helper".
- `CLAUDE.md` Hot Invariants: one bullet for each of: monthly hours source (2026-10-30), IT TL exclusion helper, the focus-refetch exception for admin queries. Add a Task Router row: `this month, global_stats, hours widget, KPI strip` -> `docs/workflow-invariants.md` new item.
- `docs/engagement-metrics.md`: add "What the metrics page explains" listing the guide and the single weight constant; `.devin/context/PLUGINS/09-engagement.md` kept in sync.
- `docs/audits/2026-10-30-admin-dashboard-engagement-kpi-audit.md`: append a "Verification 2026-10-30" section (table above) and mark 4a not reproduced.
- Workflow: add to the full-audit checklist "reproduce every figure against a second widget on the same page" (the check that exposed #1b) and "measure at 1024px as well as 1440px" for chart sizing.

## Phase 7: Final verification (once, at the end)

**How this serves the primary goal:** proves all three outcomes together.

Run: `py -3.14 manage.py makemigrations --check`; `py -3.14 manage.py test apps.dashboard plugins.engagement plugins.ticket_kpi plugins.skills`; `python -m ruff check --output-format=concise <changed .py>`; `cd frontend && npx tsc --noEmit && npx vitest run && node scripts/modal-audit.mjs && node scripts/control-audit.mjs && node scripts/surface-audit.mjs && npm run build`; then `graphify update .`. Browser pass on the e2e DB as admin, e2e_tl and e2e_tl_b (light/dark, 375/1024/1440, zero console errors, 2xx network).
Anti-pattern sweep: `grep -rn "total_overtime_hours" frontend/src/pages`, `grep -rn "plugins.skills" plugins/ticket_kpi`.

## Out of scope

Prod data figures; de-duplicating the admin breach banner (owner decision); changing `global_stats` totals; any Engagement scoring change.
