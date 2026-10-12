# TL Scorecard, Payroll, Team Export, Engagement PDF and Admin Notification Controls — Implementation Plan

Seven user-requested changes, sequenced into eight self-contained phases a fresh session can execute one at a time (TDD, targeted gates per phase, one full verification pass at the end).

> Protocol: `.devin/context/11-PLAN-CREATION.md`. Every path/symbol below was verified on 2026-10-11 against `main` @ `fee31ec` by five discovery passes plus orchestrator spot-checks. If a line number has drifted, re-locate the **symbol** (never guess); if the symbol is gone, STOP and report.

---

## Pre-approved decisions (user, 2026-10-11)

| # | Question | Decision |
|---|---|---|
| D1 | Wage in the TL scorecard member modal (Task 4) | **TLs see the current gross wage of their own scoreable team members** in the scorecard modal. This is a deliberate access expansion (payroll `view` stays HR-only for every other payroll surface). Scope = `scoreable_member_ids(leader)`; HBPR denied; staff see any leader's team via `?leader_id=`. |
| D2 | Payroll Generate when a user has no wage for the month (Task 2) | **Skip + report, and exclude superusers.** Users whose wage does not cover the run month are skipped and listed in the response; `is_superuser=True` accounts are never included in a payroll run. |
| D3 | `/team` export vs payroll (Task 3) | **Add a "Payroll settlement" column + a "By payroll period" mode** to the TL export dialog. |
| D4 | PDF engine for Tasks 5 & 6 | **Server-side reportlab** (`reportlab==5.0.1`, already pinned, `requirements.txt:19`) with native `reportlab.graphics` charts. Verified importable: `LinePlot`, `VerticalBarChart`, `Drawing` (py -3.14, 2026-10-11). |

Orchestrator decisions (senior defaults — change only by editing this section first):

| # | Decision | Why |
|---|---|---|
| O1 | Task 1: remove Leave-SLA / OT-turnaround / Escalation **trend** charts from `/tl-scorecard/visualize` only. The Overview tab keeps its existing cards. | User asked about the visualize page. Removing the leave/overtime fields from `ScorecardSerializer` would break the XLSX, Overview and tests (YAGNI). |
| O2 | Task 1 needs EPR data, and `epr_metrics()` (`plugins/tl_scorecard/services.py:216`) has **no endpoint**. Add one read-only action `epr-progress` on `TLScorecardViewSet`. | It's the only governance KPI that can't be charted today. |
| O3 | Shared PDF kit lives in **`core/utils/pdf_report.py`**, not in a plugin. | Plugins must never import each other (Hot Invariant "Plugin removal safety"). Payroll's helpers are in `plugins/payroll`, so they can't be imported, only used as a model to copy. |
| O4 | PDF palette = hard-coded RGB constants inside `core/utils/pdf_report.py`. | A PDF can't read CSS tokens. This counts as data-level colour, exempt from the "no raw hex in .tsx" rule (the rule covers `.tsx` only). Pick values with the `dataviz` skill validator. |
| O5 | Format selector query param is **`file_format=xlsx|pdf`** (default `xlsx`). Never `format=`. | DRF reserves `format` (same trap documented for data-import templates). |
| O6 | Task 6: the "per-month detail" is the snapshot's per-type metrics (`TLApprovalMetric.metrics[type]`: submitted/decided/approved/rejected/on_time/breaches/pending_past_deadline/avg+p50+p90 TTA/aging) for every month of the year, **not** a per-request list. | A per-request list would mean re-implementing `compute_type_metrics` filters and SLA deadlines in a second place, so numbers would drift from the snapshot, and it would put employee leave detail into a manager-meeting PDF. Listed under Out of scope as a possible follow-up. |
| O7 | Task 7 reuses the **existing** `NotificationEventTypeConfig` kill-switch (`plugins/notifications/models.py:176`). No new model, no `GlobalSettings` field. Admin toggles act per **preference key** (a group toggles every member event type). | The backend already hides and suppresses disabled types. What's missing is the API, the UI and three gaps (see Phase 3). |
| O8 | Task 7 API permission is `IsAdminUser` (staff), route under `SuperuserRoute` + `AdminShell`. | Same as `GlobalSettingsViewSet` (`apps/leave_management/viewsets.py:252-296`). |

---

## Objective & acceptance criteria

| ID | Criterion (checkable) |
|---|---|
| AC1 | `/tl-scorecard/visualize` renders no section with id `viz-leave-sla`, `viz-ot-turnaround` or `viz-escalations`, and renders the governance sections listed in Phase 4. `grep -n "viz-leave-sla\|pct_within_2_days\|avg_turnaround_days" frontend/src/plugins/tl_scorecard/pages/TLScorecardVisualizationPage.tsx` returns 0 hits. |
| AC2 | `POST /api/plugins/payroll/runs/<draft>/generate/` with one in-scope user lacking a wage for the month returns **200** with `skipped_users=[{user_id, username, reason}]`. Superusers never get a `PayrollLine`. Test-pinned. |
| AC3 | The TL `/team` OT/standby export has a "Payroll settlement" column and a work-date / payroll-period mode. Test-pinned on backend and in `TeamExportDialog.test.tsx`. |
| AC4 | The TL scorecard has a **Team** tab: a `DataTable` of scoreable members with an Eye row action that opens a right-side detail panel (wage, leave balance, EPR, PIP/idle/absence/promotion). It fires **no request** on open. HBPR gets 403 from the endpoint. Test-pinned. |
| AC5 | The scorecard export returns a redesigned XLSX (`file_format=xlsx`) and a new PDF (`file_format=pdf`, starts with `%PDF`). Both apply `_mask_one_on_one` and HBPR evidence scoping. The frontend offers both formats. |
| AC6 | The engagement `metrics/export/` returns a PDF for `file_format=pdf&scope=month|year`, built from `aggregate_rows` / `_group_by_month` (no recomputed math). The frontend Export popover offers the PDF items. |
| AC7 | A new admin page `/admin/notifications` lists every registered notification preference key grouped by audience. Toggling one off hides it from every user's Settings and suppresses creation and push. Turning it back on restores both. Test-pinned on backend and frontend. |
| AC8 | The full verification pass (Phase 8) is green, with evidence pasted. |

## Scope

**IN:** the seven tasks above, their tests, docs and invariant updates.

**OUT:**
- Changing payroll `view` grants or any payroll page.
- Removing leave/overtime fields from `ScorecardSerializer`.
- Per-request engagement detail list (follow-up candidate).
- Email channel for notifications (none exists).
- Server-side CR exclusion in notification preferences (pre-existing frontend-only gate, not requested).
- Changing `captureChartsToPdf`.

**Do-not-touch list:**
- `plugins/engagement/services.py` math (`aggregate_rows`, `weighted_mean`, `weighted_avg_tta_hours`). Reuse only.
- `plugins/tl_scorecard/csv_export.py::_cell` and `records/recordsCsv.ts`. Reuse, don't fork.
- `apps/users/migrations/0015*` (UserTech) and every existing migration.
- `frontend/src/components/visualization/pdfExport.ts` and its test.
- `frontend/src/components/ui/tableStyles.ts`, `button.tsx`, `controlSurface.ts`, `src/theme/tokens.test.ts` values.
- `_allowed_payroll_user_ids` (`plugins/payroll/viewsets.py:80-98`) semantics.
- `plugins/data_import/importers/payroll_draft.py` (already skips correctly).
- User-owned stray files in the repo root/frontend (`{const`, `frontend/[k`, `frontend/k)`, `frontend/k+`, `frontend/{const`, `frontend/v.consoleErrors.length`, `console.log(e.message))'`, `frontend/scripts/_tmp-measure-users.mjs`, `admin-gui-screenshots/*`). Never add, edit or delete them.

---

## Phase 0 — Documentation discovery (DONE — consolidated "Allowed APIs")

Before each phase, the executor must read the routed context file named in that phase. This table is the verified API surface. **Anything not listed must be verified before use.**

| Area | Verified symbol / location | Notes |
|---|---|---|
| Payroll user selection | `PayrollRunViewSet._resolve_users(self, user_ids)` `plugins/payroll/viewsets.py:1055-1067` | Unrestricted branch pre-filters "any active wage" (no month check). Scoped branch has **no** wage filter. |
| Payroll generate | `generate` `viewsets.py:1069-1097`; `create` `viewsets.py:~1020-1052`; `generate_line` `viewsets.py:~1124-1131` | Bare `except Exception` → generic 400 (real reason only logged). |
| Payroll service | `generate_draft_run(run, users)` `plugins/payroll/services/payroll_service.py:368-442`; `regenerate_single_line` `:595-663` | One raise rolls back the whole atomic block. |
| Wage resolution | `WageAssignment.resolve_for_month(cls, user, year, month)` `plugins/payroll/models.py:227-263` | Raises `django.core.exceptions.ValidationError` for 0 or >1 candidates. Never returns None. |
| Skip pattern to copy | `plugins/data_import/importers/payroll_draft.py:148-158` | `try: resolve_for_month … except DjangoValidationError as exc: skipped.append({... 'reason': exc.messages[0]})` |
| Payroll FE | `PayrollRunDetailPage.tsx:71-81` (`generateMutation`), `payrollService.ts:253-255`, `lib/error-handler.ts:194-205` | Success toast ignores body today. |
| TL export | `ExportOTStandbyView` `apps/reports/viewsets.py:633-741` (`date_mode` `work_date|processing_period` at 654-657 already exists); `apps/reports/services/export_service.py:138-299` | Records built at 198-203 / 221-226, headers 262-263, rows 295-298. |
| Settlement data | `OvertimeLog.resolved_settlement_period` (`apps/overtime/models/core.py:138`), `StandbyLog.resolved_settlement_period` (`apps/standby/models/core.py:140`); `PayrollRunEntry` (`plugins/payroll/models.py:636-733`: `source_kind`, `source_id`, `resolved_period`, `status`, `run`) | Finalize sets `resolved_settlement_period` (`payroll_service.py:521-545`). |
| TL export FE | `TeamExportDialog.tsx` (sends no `date_mode`), `reportService.exportOTStandby` `services/reportService.ts:147-160`; HR variant `exportPayrollOTStandby` `:162-175` | |
| Scorecard API | `TLScorecardViewSet` `plugins/tl_scorecard/viewsets/scorecard.py`: `_resolve_leader`, `_mask_one_on_one`, `scorecard`, `trend(?months=1-24&month=&leader_id=)`, `export` (149-204) | `trend` is the only range endpoint. |
| Scorecard services | `build_scorecard(user, month, current_state=None)` `services.py:471`; `scorecard_trend(user, months, end_month)` `:340`; `epr_metrics(team_member_ids, year)` `:216` (no endpoint); `governance_records(leader, team_member_ids, year, subject_ids=None)` `:411`; `_current_state_metrics` `:459` (flat across trend points) | |
| Scorecard serializer | `ScorecardSerializer` `serializers.py:84-96`: `month, team_size, leave, overtime, meetings{one_on_one_compliance_pct, tl_sync_count, team_meetings_held, team_meetings_with_hrbp, team_meeting_notes_within_24h}, idle{open_count, resolved_count}, review_deliveries_ytd, seniority{junior, mid, senior, unset}, absences{open_count, breached_5_day_sla}, pip{active_count, pending_approval_count}, promotion{promoted_count, team_size, promoted_pct, target_pct}, escalation_count` | |
| Scorecard XLSX | `plugins/tl_scorecard/excel_export.py::build_workbook_bytes(scorecard, governance, period_label, hbpr_evidence=None)` `:177`, `_Formats` `:24-44`, xlsxwriter with `strings_to_formulas: False, strings_to_urls: False` | |
| Scope | `scoreable_member_ids(user)` `plugins/tl_scorecard/scope.py:5-26`; `UserProfile.get_team_member_ids()` `apps/users/models/core.py:483-509` | `scoreable_member_ids` excludes Albanian TLs. |
| HBPR | `HbprScopedQuerysetMixin` `core/mixins/viewer_scope.py:65-144`; `is_hbpr`, `get_hbpr_scope` `apps/users/services/hbpr_scope.py`; `is_hbpr_only` `core/mixins/permissions.py:136`; walk test `plugins/tl_scorecard/test_hbpr_invariants.py:30-50` | The walk test **does not** cover `@action`s on `TLScorecardViewSet`, so new actions need explicit tests. |
| Leave | `LeaveBalance` `apps/leave_management/models/core.py:73`; `LeaveBalanceSerializer` `apps/leave_management/serializers.py:22-40`; `count_business_days` `apps/leave_management/models/core.py:19` | |
| EPR | `EPRCycle` `plugins/tl_scorecard/models.py:297-310` (`goal_setting_completed_at`, `mid_year_completed_at`, `final_review_completed_at`, related `goals`) | |
| Engagement export | `TLEngagementMetricsViewSet.export` `plugins/engagement/viewsets.py:222-257`; `excel_export.py::build_workbook_bytes(target_rows, trend_rows, scope, period_label)` `:294`, `_group_by_month` `:35`; `aggregate_rows` `services.py:565-593`; `_trend_payload` `viewsets.py:137-155` | Rows are already freshened in `export`. |
| Engagement FE | `EngagementMetricsPage.tsx:124-141` (`handleExport`), `:227-254` (Popover), `engagementService.exportReport` `services/engagementService.ts:40-44` | |
| reportlab model | `plugins/payroll/services/export_service.py`: `_check_reportlab_available` ~428, `_payslip_styles` ~439, `_base_table_style` ~457, `_draw_page_number` ~508, `_new_payslip_doc` ~521, `generate_payroll_pdf` ~810; response shape `plugins/payroll/viewsets.py:1315-1341` | Copy, don't import. |
| Notifications | `NotificationEventTypeConfig.is_type_enabled` `plugins/notifications/models.py:176-200`; `REGISTRY`, `get_all_types()`, `get_preference_groups()` `plugins/notifications/types/base.py:12,102,106`; class attrs `event_type, label, description, category ('own'/'team'/'oversight'), preference_group, preference_group_label, user_configurable, preference_key`; choke point `_create_notification` `plugins/notifications/signals.py:54-100` (kill-switch at 75-76); preferences action `plugins/notifications/viewsets.py:148-196`, `_available_preference_pairs` `:86-143` (kill-switch at 120-123) | Scorecard types register only when `tl_scorecard` is enabled. |
| Admin GUI | `AppRoutes.tsx:190-230` (`SuperuserRoute` → `AdminShell`), `useAdminNavItems.ts:186-192` (Global Settings item, group `"System"`, `fullAdminOnly`; `pluginName` gating pattern 155-162), `adminBreadcrumbs.ts:19-42` (auto from nav), template `pages/admin/GlobalSettingsPage.tsx` | |
| UI primitives | `DataTable` `components/ui/DataTable.tsx:39-66`; `RowActions` `components/ui/RowActions.tsx` (`RowAction{label, icon, onClick, tone?, disabled?}`); `UserDetailPanel` `components/admin/UserDetailPanel.tsx` (`DialogContent side="right" size="panel"`, `Fact` rows); `StatCard`, `EmptyState`, `SwitchField` `components/common/forms/SwitchField.tsx`; `ConfirmDialog`; `toDays()` `pages/admin/hooks/leaveBalanceFilters.ts:35-39` | |
| PDF FE download | `downloadBlobResponse` `lib/download.ts`; `parseFilenameFromDisposition` pattern `EngagementMetricsPage.tsx:57-63` | |

**Anti-patterns (things that don't exist, or are forbidden):**
- No `WageAssignment.get_current()`, and `resolve_for_month` never returns None. Wrap it.
- No `epr` key on `ScorecardSerializer`.
- No engagement endpoint takes a calendar year except `export?scope=year`. Don't call `trend` with a year.
- No `format=` query param. Use `file_format=`.
- Don't import `plugins.payroll` / `plugins.engagement` from another plugin or from core except via `try/except ImportError` (fail closed).
- Don't `from plugins.payroll.services.export_service import …` inside engagement or tl_scorecard.
- Don't `transition-all`, raw hex/slate in `.tsx`, `dark:` colour overrides, `max-w-*` on `DialogContent`, or `h-8..h-12` on controls.

---

## Phase 1 — Payroll Generate: skip users without a wage, exclude superusers (Task 2)

**Load first:** `.devin/context/PLUGINS/01-payroll.md`, `.devin/context/06-DOMAIN-INVARIANTS.md`. **Skills:** `test-driven-development`, `security-review` (scope logic).

### 1.1 Tests first (red)
New file `plugins/payroll/tests/test_generate_skips.py` (copy fixtures and setup style from `plugins/payroll/tests/test_integration.py:540-595`, `test_hr_can_generate_payroll_run_with_a_wageless_user_in_scope`):
1. `test_generate_skips_user_whose_wage_starts_after_month`: user A has a wage from 2026-01-01, user B (non-superuser) has a wage from 2026-09-20. The run is 2026-08 draft. POST `generate` → 200; `line_count == 1`; `skipped_users == [{"user_id": B.id, "username": B.username, "reason": "No active wage assignment for <B> in 2026-08."}]` (assert `reason` startswith `"No active wage assignment"`).
2. `test_generate_never_includes_superusers`: a superuser with a valid wage covering the month → no `PayrollLine` for them. `skipped_users` does **not** list them (they're excluded, not skipped).
3. `test_scoped_generate_with_wageless_member_skips_instead_of_400`: a TL with a payroll view+manage grant (copy the grant setup from `test_scope_leak.py:42-48`) whose team member has no wage → 200, member in `skipped_users`.
4. `test_create_run_reports_skipped_users`: POST `runs/` (create) → 201, body includes `skipped_users`.
5. `test_generate_line_returns_real_reason_for_wageless_user`: `generate_line` for a wageless user → 400 with `detail` containing `"No active wage assignment"`.

### 1.2 Implementation
1. `plugins/payroll/services/payroll_service.py`: add a module-level function next to `generate_draft_run` (no new class):
   ```python
   def partition_payable_users(users, year: int, month: int):
       """Split users into (payable, skipped) for a payroll month.

       Superusers are never payroll subjects. A user whose wage does not
       cover the month (or overlaps) is skipped with the model's own message,
       instead of aborting the whole run.
       """
       payable, skipped = [], []
       for user in users:
           if user.is_superuser:
               continue
           try:
               WageAssignment.resolve_for_month(user, year, month)
           except DjangoValidationError as exc:
               skipped.append({'user_id': user.id, 'username': user.username, 'reason': exc.messages[0]})
               continue
           payable.append(user)
       return payable, skipped
   ```
   Import `ValidationError as DjangoValidationError` the way `payroll_draft.py` does. It costs one extra query per user. Acceptable for N≈50; note it in the PR. Don't optimise speculatively.
2. `viewsets.py` `generate`: after `users = self._resolve_users(user_ids)`, call `users, skipped = partition_payable_users(users, run.year, run.month)`, pass `users` to `generate_draft_run`, and add `'skipped_users': skipped` to the 200 body. Keep the existing `except Exception` (unrelated failures). Audit `new_values` add `'skipped_count': len(skipped)`.
3. `viewsets.py` `create`: same partition inside the atomic block, and include `skipped_users` in the 201 body. **Serializer body unchanged.** Build the response as `{**PayrollRunSerializer(run).data, 'skipped_users': skipped}`.
4. `generate_line`: catch `DjangoValidationError` **before** the generic handler and return `{'detail': exc.messages[0]}` 400. Generic message unchanged for everything else.
5. `_resolve_users` is unchanged (do-not-touch scope). The superuser exclusion lives in `partition_payable_users`, so it applies to both branches.
6. Frontend `frontend/src/plugins/payroll/pages/PayrollRunDetailPage.tsx` `generateMutation.onSuccess(data)`: if `data.skipped_users?.length`, show `toast.warning("Regenerated — N employee(s) skipped", { description: first 5 as "username: reason", joined by "\n", plus "+K more" })`; else keep the existing success toast. Add `skipped_users?: { user_id: number; username: string; reason: string }[]` to the generate response type in `payrollService.ts`. Same handling wherever run **create** is called (find with `grep -rn "createRun\|runs/\`" frontend/src/plugins/payroll`).
7. Test `frontend/src/plugins/payroll/pages/PayrollRunDetailPage.test.tsx`: mock generate → `{skipped_users:[…]}` and assert the warning toast text.

### 1.3 Gate
```
py -3.14 manage.py test plugins.payroll.tests.test_generate_skips plugins.payroll.tests.test_integration plugins.payroll.tests.test_ux_overhaul plugins.payroll.tests.test_scope_leak
cd frontend; npx vitest run src/plugins/payroll; npx eslint src/plugins/payroll
```
**Guards:** don't touch `_allowed_payroll_user_ids`; don't change finalized-run immutability; don't swallow non-wage exceptions.

---

## Phase 2 — `/team` export: payroll settlement column + payroll-period mode (Task 3)

**Load first:** `.devin/context/06-DOMAIN-INVARIANTS.md` (carry-over 89-103), `.devin/context/PLUGINS/01-payroll.md`. **Skills:** `test-driven-development`, `django-perf-review`.

**Answer to the user's question (record it in the PR description):** today the TL export is **not** payroll-aware. It is a live query of approved (or pending) records filtered by **work date**. It neither stops at "finalized" nor knows which payslip a record lands in. Its "Processing Period" column is the *requested* month, which is wrong for late approvals that payroll rolled into the next open run (`resolution_reason='target_finalized'`).

### 2.1 Settlement label semantics (exact strings)
For each OT/standby record:
| Condition (evaluated in order) | Cell text |
|---|---|
| `resolved_settlement_period` is set | `Paid · {Mon YYYY}` (e.g. `Paid · Aug 2026`) |
| payroll installed and a **draft** `PayrollRunEntry(source_kind, source_id)` exists | `In draft run · {Mon YYYY of entry.resolved_period}` |
| status is pending | `Pending approval` |
| otherwise | `Not yet in a payroll run` |

Header: `Payroll settlement`. Place it right after the existing "Carried Over" column.

### 2.2 Tests first
Extend `apps/reports/tests.py`, next to the processing-period/carryover class at `:852-951`:
1. `test_tl_export_settlement_column_paid` (a record with `resolved_settlement_period=2026-08-01` → `Paid · Aug 2026`).
2. `test_tl_export_settlement_column_in_draft` (a draft `PayrollRunEntry` for the record → `In draft run · Sep 2026`). Use `@skipUnless(apps.is_installed('plugins.payroll'))` or match how existing reports tests reference payroll.
3. `test_tl_export_settlement_column_not_in_run`.
4. `test_tl_export_processing_period_mode_is_team_scoped`: a TL with `date_mode=processing_period` still only gets team rows (re-uses `apply_visibility_constraints`; the regression guard for the new FE option).
5. Query-count guard: `assertNumQueries` stays constant for 1 vs 5 records (proves the bulk lookup).

Frontend `frontend/src/pages/team/components/TeamExportDialog.test.tsx`: selecting "By payroll period" sends `date_mode: "processing_period"`. The default sends `date_mode: "work_date"`.

### 2.3 Implementation
1. `apps/reports/services/export_service.py`: add one helper `_draft_settlement_periods(ot_ids, sb_ids) -> dict[(kind, id), date]`:
   ```python
   try:
       from plugins.payroll.models import PayrollRunEntry
   except ImportError:
       return {}
   ```
   Then **one** query: `PayrollRunEntry.objects.filter(status='draft', ...).values_list('source_kind','source_id','resolved_period')`. Verify the exact `status` value and the `source_kind` literals in `plugins/payroll/models.py:636-733` before writing; don't guess `'overtime'` vs `'ot'`. Build the label per §2.1 inside the record build (198-203, 221-226), add the header (262-263) and the row value (295-298). Make sure the querysets already `select_related` what they need; `resolved_settlement_period` is a local column.
2. `frontend/src/services/reportService.ts` `exportOTStandby` params type: add `date_mode?: "work_date" | "processing_period"`.
3. `TeamExportDialog.tsx`: add a third `Select` ("Filter dates by": `Work date` / `Payroll period`), visible only when `exportType === "ot-standby"`. Pass `date_mode`. Under the select, add a muted helper line (`text-xs text-muted-foreground`): "Payroll period matches HR's payroll export: records carried over to next month appear in the month they're paid." Filename suffix `_payroll_period` when that mode is on. Use the control kit (`SelectTrigger controlSize="md"`), per `docs/ui-control-kit.md`.

### 2.4 Gate
```
py -3.14 manage.py test apps.reports
cd frontend; npx vitest run src/pages/team; npx eslint src/pages/team src/services/reportService.ts; node scripts/control-audit.mjs --strict --exclude=src/plugins/engagement
```
**Guards:** core app → payroll import only through `except ImportError` (fail closed = empty dict = no draft labels). No per-row queries.

---

## Phase 3 — Admin notification controls (Task 7)

**Load first:** `.devin/context/03-FRONTEND-PATTERNS.md` §13 (dialogs), §19 (controls), §20 (admin lift); `docs/ui-control-kit.md`; `DESIGN.md`. **Skills:** `test-driven-development`, `security-review`, `frontend-ui-ux`, `accessibility`.

### 3.1 Design
- **Catalogue row = one preference key** (`preference_key`, i.e. group key or the bare event type), built from `get_all_types()`:
  `{ key, label (preference_group_label or label), description (first member's description; for a group, join unique member labels), audience: "own"|"team"|"oversight", user_configurable: bool, event_types: [..], enabled: bool }`.
  `enabled` = **all** member event types enabled. `partially_enabled` = some but not all (legacy rows written in Django admin). Show it as a mixed state.
- **Audience copy** (for UI grouping): `own` → "Everyone (own requests)", `team` → "Team leaders, HR & admins", `oversight` → "HR, HBPR & admins". These match `_available_preference_pairs` (`viewsets.py:94-114`). Restate it in a code comment pointing to that function.
- **Toggle semantics:** PATCH `{enabled}` for a key writes `NotificationEventTypeConfig.update_or_create(event_type=t, defaults={'is_enabled': enabled})` for **every** member event type, in one `transaction.atomic`. This fixes gap 1: group keys never get rows of their own.
- **Always-on types** (`user_configurable=False`) are listed with an "Always delivered — not shown in user settings" badge. They can still be disabled globally, which suppresses sending. The confirm dialog for them says so explicitly.
- **Performance (gap 3):** add a classmethod `NotificationEventTypeConfig.disabled_event_types() -> frozenset[str]` that runs one query (`filter(is_enabled=False).values_list('event_type', flat=True)`), cached under `CacheKey`-style key `v{version}:notifications:disabled_types` via `django.core.cache` (reuse the `apps/core/cache_constants.py` helper conventions; add a `CacheKey.notification_disabled_types()` method there, ttl `CacheTTL.LONG`). Re-implement `is_type_enabled(t)` as `t not in cls.disabled_event_types()`, so `signals.py:75` and `viewsets.py:122` become cache hits with **no call-site change**. Invalidate (cache.delete) inside the new PATCH and in a `post_save`/`post_delete` receiver on `NotificationEventTypeConfig` (Django admin edits stay coherent).
- **Endpoint:** a new `NotificationEventTypeConfigViewSet(viewsets.ViewSet)` in `plugins/notifications/viewsets.py`:
  - `list` → catalogue
  - `partial_update(pk=<key>)` → toggle; 404 for an unknown key
  - `permission_classes = [IsAdminUser]` for all methods
  - Register it in the plugin's router (`plugins/notifications/plugin.py:23-26` / urls) as `event-type-config`. URL: `/api/plugins/notifications/event-type-config/`.

### 3.2 Tests first
`plugins/notifications/test_event_type_config_api.py` (call `cache.clear()` in `setUp`, per the Hot Invariant "Reference-table read caching"):
1. Non-staff GET → 403; staff GET → 200, rows include `leave_approved`-style core keys and (when `tl_scorecard` is enabled in tests) `hbpr_meetings` with `event_types` length > 1.
2. PATCH group key `hbpr_meetings {enabled:false}` → every member event type has an `is_enabled=False` row. The HBPR user's `preferences` no longer lists `hbpr_meetings`. Dispatching a member type creates **no** `Notification`.
3. PATCH back to true → it reappears and is delivered.
4. Disabling an always-on type (`scorecard_record_shared`) suppresses creation.
5. Unknown key → 404; non-staff PATCH → 403.
6. Cache coherence: an admin-model save (`NotificationEventTypeConfig.objects.update_or_create(...)`) followed by `is_type_enabled` reflects the change (receiver invalidation).
7. Query count: the `preferences` endpoint for a user does ≤ the previous count (assert it does not scale with the number of types).
The existing `plugins/notifications/test_push.py:315,326,336` must stay green **untouched**.

Frontend:
- `frontend/src/pages/admin/NotificationSettingsPage.test.tsx`: renders the groups; toggling off opens the confirm dialog, confirming PATCHes `{enabled:false}` and invalidates `["admin","notification-config"]`; always-on badge visible; mixed state renders as "Partially on".
- `useAdminNavItems` test (if one exists, extend it): the item is hidden when the `notifications` plugin is inactive.

### 3.3 Frontend implementation
1. `frontend/src/plugins/notifications/service.ts`: add `getEventTypeConfig()` and `setEventTypeEnabled(key, enabled)` (`BASE = "/plugins/notifications"`, never `/api/...`) and the type `NotificationTypeConfig`.
   - Core admin page → plugin service import: the page lives in core `pages/admin/`. Per "Plugin removal safety", core must not statically import plugin modules. So **put the page inside the plugin**: `frontend/src/plugins/notifications/pages/NotificationSettingsAdminPage.tsx`. Register it in `frontend/src/plugins/index.ts`, and declare a route with `"layout": "admin"` + path `/admin/notifications` in `plugins/notifications/plugin.py` route metadata. Copy the `plugins/analytics/plugin.py:53-57` shape; it's consumed by `usePluginRouteObjects("admin")`, `AppRoutes.tsx:100-120`. Add the sidebar entry via the plugin's `admin-sidebar-nav-system` injection slot (verify the slot name in `AdminSidebar.tsx:165-166` and the analytics plugin's metadata), and add the crumb to `ADMIN_PLUGIN_CRUMBS` (`adminBreadcrumbs.ts:9-14`).
2. Page layout (copy `GlobalSettingsPage.tsx` structure: `PageShell` + `GlassCard`, `LoadingCard`/`ErrorCard`):
   - Header: title "Notification types", description "Turn a notification off for everyone. Disabled types disappear from every user's Settings page and are no longer sent."
   - A `StatCard` row: total types / enabled / disabled (real data only).
   - `FilterToolbar` with `SearchField` (filter by label) + `FacetRow` chips for audience (`Everyone`, `Team leaders`, `Oversight`) and status (`On`, `Off`).
   - One card per audience group, each with a `DataTable` (header via `tableStyles.ts` constants; gate `table-header-audit.mjs`) with columns: Notification (label + muted description), Delivered to (audience chip), Type (`Configurable` / `Always on` badge via `toneSurfaceClass`), Status (`Switch` with `aria-label="Enable {label}"`).
   - Toggle off → `ConfirmDialog` (tone `warning`): "Disable "{label}" for everyone?" with body listing the effect (hidden in Settings, nothing sent, existing notifications kept). Toggle on applies immediately (no confirm). Optimistic update + rollback on error, then `toast.success`.
   - React Query key `["admin","notification-config"]` (exact key; never invalidate the bare `["admin"]` prefix).
3. Settings page: no change needed. `NotificationPreferencesSection` re-fetches on mount and the backend already filters. Verify in-browser.

### 3.4 Gate
```
py -3.14 manage.py test plugins.notifications plugins.tl_scorecard.test_tl_scorecard_notifications
cd frontend; npx vitest run src/plugins/notifications src/pages/settings; npx eslint src/plugins/notifications; node scripts/modal-audit.mjs; node scripts/table-header-audit.mjs; node scripts/control-audit.mjs --strict --exclude=src/plugins/engagement; node scripts/surface-audit.mjs --strict --exclude=src/plugins/engagement
```
Browser check: disable `hbpr_meetings` as admin → log in as an HBPR → Settings has no "Meetings" group → re-enable.

---

## Phase 4 — `/tl-scorecard/visualize` governance charts (Task 1)

**Load first:** `.devin/context/08-ANALYTICS-VISUALIZATION.md`, `docs/hbpr-and-scorecard.md`, `.devin/context/03-FRONTEND-PATTERNS.md` §10. **Skills:** `dataviz` (before any chart code), `test-driven-development`, `frontend-ui-ux`.

**Diagnosis (put this in the PR):** the page never calls engagement endpoints. It charts the scorecard's own `leave.pct_within_2_days`, `overtime.avg_turnaround_days` and `escalation_count` from `GET /plugins/tl_scorecard/trend/?months=6` (`TLScorecardVisualizationPage.tsx:61-64,176-300`). Those are approval-speed (SLA) metrics, which is Engagement's domain. None of the scorecard's governance KPIs are visualised.

### 4.1 Backend: `epr-progress` action
`TLScorecardViewSet`: add `@action(detail=False, methods=['get'], url_path='epr-progress') def epr_progress(self, request)`:
- `?year=` (int 2000-2100, default `date.today().year`, 400 otherwise); `leader = self._resolve_leader(request)` (inherits TL/staff/HBPR rules).
- Returns `epr_metrics(scoreable_member_ids(leader), year)` as-is. Inspect `services.py:216-252` for the exact dict and add an `EprProgressSerializer` mirroring it field-for-field.
- Tests in `plugins/tl_scorecard/test_tl_scorecard_phase3.py` (next to `ScorecardTrendTests` :438): TL gets own team; staff with `leader_id`; HBPR with an out-of-scope `leader_id` → 403; bad year → 400.

### 4.2 Chart set (replaces all three sections)
Data: the existing trend query (`["tl-scorecard","trend"]`, keep 6 months) + new `["tl-scorecard","epr-progress",year]`. Use `ChartSection`/`ChartCard` with `data-chart-section` ids so the existing "Export PDF" keeps working unchanged. Colours `hsl(var(--chart-N))`, axes `hsl(var(--muted-foreground))`, every `ResponsiveContainer` in a fixed-height parent.

| id | Title | Data | Chart |
|---|---|---|---|
| `viz-kpis` | This month at a glance | latest trend point | 4 `StatCard`s: 1:1 compliance % (hide the card when `null`, i.e. masked), Team meetings held (`with HRBP` as footer), Reviews delivered YTD `n / 12` with `progressPercent`, Promotion rate `promoted_pct%` vs `target_pct%` |
| `viz-meeting-cadence` | Meeting cadence | trend `meetings.team_meetings_held`, `team_meetings_with_hrbp`, `tl_sync_count` | grouped `BarChart` by month |
| `viz-one-on-one` | 1:1 compliance | trend `meetings.one_on_one_compliance_pct` | `AreaChart` 0–100 with a 100% reference line. **Omit the whole section if every point is null** (HBPR viewer) |
| `viz-notes-24h` | Meeting notes within 24h | trend `meetings.team_meeting_notes_within_24h` vs `team_meetings_held` | `ComposedChart` (bar held + line notes) |
| `viz-reviews` | Review deliveries vs target | trend `review_deliveries_ytd` | `LineChart` + a `ReferenceLine` of the pro-rata target `12 * monthIndex / 12` (computed client-side from each point's month; comment it) |
| `viz-epr` | EPR stage progress ({year}) | `epr-progress.stages.{goal_setting,mid_year,final_review}.pct_on_time` + `cycles_started`, `cycles_with_5plus_goals` | horizontal `BarChart` 0–100 per stage + 2 small stat lines |
| `viz-risk` | Team risk snapshot (now) | latest point `pip.active_count`, `pip.pending_approval_count`, `idle.open_count`, `absences.open_count`, `absences.breached_5_day_sla`, `escalation_count` | horizontal `BarChart`, tone-coloured (danger for breached/escalations); subtitle "Current state, not a trend" (these fields are flat across trend points, `services.py:459-468`) |
| `viz-seniority` | Seniority mix | latest `seniority.{junior,mid,senior,unset}` | donut (`PieChart` innerRadius) with a centre total |

The empty state stays `team_size === 0` on every point. Keep the HBPR redirect (lines 311-315) and the PDF handler (70-94, dynamic import) unchanged.

### 4.3 Tests
`TLScorecardVisualizationPage.test.tsx`: extend the fixture (`:23-42`) and mock `getEprProgress`. Assert the new section headings render. Assert "Leave SLA", "Overtime Turnaround" and "Escalation Risks" are **absent**. Assert the 1:1 section is absent when all values are null. Existing empty, error, PDF and HBPR tests stay green.

### 4.4 Gate
```
py -3.14 manage.py test plugins.tl_scorecard.test_tl_scorecard_phase3 plugins.tl_scorecard.test_tl_scorecard_hbpr plugins.tl_scorecard.test_hbpr_invariants
cd frontend; npx vitest run src/plugins/tl_scorecard; npx eslint src/plugins/tl_scorecard
```
Browser: light, dark and 375px screenshots of `/tl-scorecard/visualize`, plus a click on "Export PDF" (the file downloads and has all 8 sections).

---

## Phase 5 — Shared PDF kit + TL scorecard XLSX redesign + PDF (Task 5)

**Load first:** `docs/hbpr-and-scorecard.md` (export content rules 326-339, wording 356-367), the payroll reportlab code listed in Phase 0. **Skills:** `dataviz`, `anthropic-skills:xlsx` (layout conventions), `test-driven-development`, `security-review` (export redaction).

### 5.1 `core/utils/pdf_report.py` (new, shared by Phases 5 and 6)
Copy the doc/table/page-number approach from `plugins/payroll/services/export_service.py` (`_new_payslip_doc`, `_base_table_style`, `_draw_page_number`). Public functions only (no classes beyond what reportlab needs):
- `PALETTE` dict: `ink`, `muted`, `rule`, `surface`, `accent`, `success`, `warning`, `danger`, and `series` (≥4 categorical colours validated with the `dataviz` skill palette validator; record the validator output in the PR).
- `new_report(buffer, *, title, subtitle, generated_by, period_label) -> (doc, story, styles)`: A4 portrait, 16 mm margins, `onPage` header band (title left, period right), footer "Generated {date} · by {name} · Page N".
- `cover_block(story, *, title, subtitle, kpis: list[tuple[label, value, tone]])`: title + a 2×N KPI tile grid (Table with rounded-look backgrounds).
- `section_title(story, text)`, `paragraph(story, text)`.
- `data_table(story, header: list[str], rows: list[list], *, col_widths=None, numeric_cols=())`: zebra rows, header band, right-aligned numerics, repeatRows=1, and every cell value passed through `xml.sax.saxutils.escape` (reportlab Paragraph markup injection guard).
- `line_chart(story, *, categories, series: dict[str, list[float|None]], y_max=None, y_suffix="", height_mm=60)`, `bar_chart(story, *, categories, series, horizontal=False, ...)`, `donut_chart(story, *, parts: dict[str, int])`: `reportlab.graphics` (`Drawing`, `LinePlot`/`HorizontalLineChart`, `VerticalBarChart`/`HorizontalBarChart`, `Pie`), with a legend. `None` values render as gaps, not zero.
- Lazy-import reportlab inside each function, matching payroll's `_check_reportlab_available` pattern.

Tests `core/tests/test_pdf_report.py` (or wherever core tests live; check `core/tests/` exists first): building a report with every helper produces bytes starting `%PDF`; a cell containing `<b>` and `&` does not raise; `None` series values don't raise.

### 5.2 XLSX redesign (`plugins/tl_scorecard/excel_export.py`)
Keep the signature `build_workbook_bytes(scorecard, governance, period_label, hbpr_evidence=None, trend=None)` (new optional `trend`), the xlsxwriter options and the sheet **names** (the HBPR evidence tests read them).
- **Summary:**
  - A merged title band and a subtitle (period, team size, generated on).
  - A KPI table with columns `Area | Metric | Value | Target | Status`. Values are real numbers with `num_format` (`0.0"%"` for percentages; no more `f"{v}%"` strings). `None` → "—" in a muted format.
  - Status is computed in Python, never as a formula: `On track` / `Watch` / `Off track`, coloured with the tone fills. Targets: 1:1 compliance 100%, reviews 12/year (pro-rata), promotion `target_pct`, PIP pending approvals 0, absences breached 0, escalations 0. Put these targets in one module constant `TARGETS` with a comment citing the existing UI copy in `ScorecardOverview.tsx` / `TeamGovernanceSection.tsx`. Read those files to copy the exact target values; if they differ from this list, the UI wins.
  - `freeze_panes`, column widths, `set_landscape`, `fit_to_pages(1, 0)`, print title rows.
- **Trend sheet** (only when `trend` is given): a month table of the meeting/reviews/promotion fields + a native xlsxwriter column/line chart (copy the engagement `_build_trend_sheet` chart approach, `plugins/engagement/excel_export.py:199`).
- **Governance:** each of the four tables as an xlsxwriter `add_table` (banded rows, autofilter) instead of hand-drawn ranges; keep the "None open" rows.
- **HBPR partnership log:** unchanged columns. Free text still goes through `csv_export._cell`-equivalent safety (`strings_to_formulas: False` already covers XLSX; keep `WorkbookFormulaInjectionTests` green).
- The `export` view passes `trend=scorecard_trend(leader, 6, month)` after `_mask_one_on_one(request, leader, *trend)`. **Masking must be applied to the trend points too.**

### 5.3 PDF (`plugins/tl_scorecard/pdf_export.py`, new)
`build_scorecard_pdf(scorecard, trend, governance, epr, period_label, leader_name, generated_by, hbpr_evidence=None) -> bytes` using `core.utils.pdf_report` only:
1. Page 1: cover with 6 KPI tiles (same KPIs and status as the XLSX Summary, from the **same** `TARGETS`/status helper. Move that helper into `excel_export.py`'s neighbour module `plugins/tl_scorecard/report_kpis.py` so both builders import one source).
2. "Meetings & reviews": cadence bar chart, 1:1 line chart (omitted when masked), reviews vs target line.
3. "EPR progress {year}": horizontal bar + table of `epr` stages.
4. "Team risks & seniority": risk bar + seniority donut.
5. "Governance records": the four tables (`governance_records` output, already HBPR-subject-scoped).
6. "Partnership log" (only when `hbpr_evidence` is non-empty): table Kind / Date / Shared summary / Action items.
Wording follows `docs/hbpr-and-scorecard.md` ("Partnership log", never "evidence" in user-facing text).

`export` action: read `file_format = request.query_params.get('file_format', 'xlsx')`; anything else → 400 `{'error': 'file_format must be xlsx or pdf'}`. Build the shared inputs **once** (scorecard, masked trend, governance, evidence rows, and for PDF `epr_metrics(team_member_ids, month.year)`), then branch. PDF response: `HttpResponse(bytes, content_type='application/pdf')` with `Content-Disposition: attachment; filename="tl_scorecard_{username}_{YYYY-MM}.pdf"`.

### 5.4 Tests first
`plugins/tl_scorecard/test_scorecard_export_formats.py`:
1. `file_format=pdf` → 200, `application/pdf`, body startswith `b'%PDF'`, filename `.pdf`.
2. `file_format=xlsx` (and missing) → same as today: `PK`, `.xlsx`. Open the bytes with `openpyxl.load_workbook(BytesIO)`. Assert sheet names `Summary, Trend, Governance, HBPR partnership log`, and that the Summary value for the 1:1 metric is a number, not a string.
3. `file_format=docx` → 400.
4. HBPR export (copy setup from `test_tl_scorecard_hbpr.py` `HbprExportScopeTests` :218): 1:1 value is "—" in the XLSX for **every** trend row. The PDF text (extract with `pypdf.PdfReader(...).pages[i].extract_text()`; pypdf is pinned) does not contain the leader's 1:1 percentage. Governance rows are limited to HBPR-scoped subjects.
5. Existing `ScorecardExportTests` (:468), `WorkbookFormulaInjectionTests`, `EvidenceExportTests`, `HbprExportScopeTests` stay green **untouched**. If one fails, fix the implementation.

### 5.5 Frontend
`frontend/src/plugins/tl_scorecard/components/ExportButton.tsx`:
- Turn it into a split menu: the primary "Export summary" opens a `DropdownMenu` (or `Popover`, matching `EngagementMetricsPage.tsx:227-254`) with "Excel workbook (.xlsx)" and "PDF report".
- `tlScorecardService.exportWorkbook(month, leaderId)` → `exportSummary(month, leaderId, fileFormat: "xlsx" | "pdf")`, sending `file_format`.
- Use the server filename via `parseFilenameFromDisposition` (copy the helper's usage, don't duplicate the function; if it's local to EngagementMetricsPage, move it to `lib/download.ts` and import it in both places).
- The icon-only variant (`RecordsTab.tsx:271`) keeps working: same menu, `aria-label="Export summary"`. All five call sites (`TLScorecardHeader.tsx:114`, `EvidenceExportSection.tsx:36`, `RecordsTab.tsx:271`, `HbprWorkspaceHeader.tsx:127`, `HbprEvidenceTimeline.tsx:101`) need no prop change.
- Update `ExportButton.test.tsx`: both menu items call the service with the right `file_format`.

### 5.6 Gate
```
py -3.14 manage.py test plugins.tl_scorecard core
cd frontend; npx vitest run src/plugins/tl_scorecard src/lib; npx eslint src/plugins/tl_scorecard
```
Manual: open both files and attach screenshots of PDF pages 1-3 and the XLSX Summary to the PR.

---

## Phase 6 — Engagement PDF report (Task 6)

**Load first:** `docs/engagement-metrics.md`, `.devin/context/PLUGINS/09-engagement.md`. **Skills:** `dataviz`, `test-driven-development`, `django-perf-review`.

### 6.1 Backend
1. New `plugins/engagement/pdf_export.py::build_report_pdf(target_rows, trend_rows, scope, period_label, leader_name, generated_by) -> bytes`. It uses `core.utils.pdf_report` and **only** these engagement functions for numbers: `aggregate_rows`, `excel_export._group_by_month`, and the per-month sub-score rollup.
   - Sub-scores: `_trend_payload` lives in `viewsets.py`. Move its row-grouping core into `services.py` as `monthly_rollup(rows)` and have `_trend_payload` call it (pure refactor, covered by the existing trend tests), so the PDF does not import from a viewset.
   - Score colour thresholds 80/50, the same as `_Formats.score_fill`.
2. Layout:
   - **Cover:** period, leader, engagement score (big), tiles: approval rate, avg TTA (h), on-time %, breaches, pending past deadline, decisions during leave / on holidays (labelled "Evidence — not scored").
   - **Trend** (year: 12 months; month: 6-month window already fetched by `export`): line chart score + sub-scores (speed 40 / approval 20 / responsiveness 20 / consistency 20 — print the weights in a caption), bar chart of avg TTA.
   - **Volume:** stacked bar submitted / decided per month for leave, overtime, standby.
   - **Per-month detail** (year: one block per month that has a snapshot, `KeepTogether`, page break every 2 months; month scope: the single month). Per type (Leave / Overtime / Standby), a table: Submitted, Decided, Approved, Rejected, On time, Breaches, Pending past deadline, Avg TTA, P50, P90. Then an aging mini bar chart from `metrics[type].aging`. Months with no snapshot print "No data recorded for {Month}" (reads only create current-month snapshots, so this is expected for older months).
   - **Footer note:** "Times computed in Europe/Tirane. Leader's own requests and deactivated users are excluded." (from the docs).
3. `TLEngagementMetricsViewSet.export`: add `file_format` (`xlsx` default | `pdf`, 400 otherwise), parsed before any DB work. Branch only at the builder call. The scoping, freshening and row selection already in `export` are reused unchanged. PDF filename: `engagement_{scope}_{username}_{YYYY or YYYY-MM}.pdf`.
4. Tests (extend `plugins/engagement/test_engagement.py` near `:369-395`; pin `services._now` like the SLA tests):
   - `test_export_month_scope_pdf` → `%PDF`, `.pdf`
   - `test_export_year_scope_pdf_has_month_sections` → pypdf text contains each month name that has a snapshot
   - `test_export_bad_file_format_400`
   - `test_export_pdf_numbers_match_summary`: the engagement score printed on the cover equals `aggregate_rows(rows)['engagement_score']`, formatted
   - HBPR denial inherited (`EngagementHbprDeniedTests` stays green)
   - A query-count assertion: the year PDF uses the same number of queries as the year XLSX ± 0 (rendering must not query)

### 6.2 Frontend
`EngagementMetricsPage.tsx` Popover:
- Add a divider + "PDF report — this month" / "PDF report — full year". Extend `handleExport(scope, fileFormat)`, and `engagementService.exportReport(month, scope, fileFormat = "xlsx")` → `params: { month, scope, file_format }`.
- Rename the existing items "Excel — this month" / "Excel — full year". Icons: `FileSpreadsheet` / `FileText` (lucide).
- Add tests to `EngagementMetricsPage.test.tsx` (it has no export tests today): each item calls the service with the right args.

### 6.3 Gate
```
py -3.14 manage.py test plugins.engagement
cd frontend; npx vitest run src/plugins/engagement; npx eslint src/plugins/engagement
```
Manual: generate a year PDF from seeded data and attach screenshots of the cover plus one month page to the PR.

---

## Phase 7 — TL scorecard "Team" tab + member detail panel (Task 4)

**Load first:** `docs/hbpr-and-scorecard.md`, `.devin/context/01-PERMISSIONS.md`, `.devin/context/PLUGINS/01-payroll.md`, `.devin/context/03-FRONTEND-PATTERNS.md` §13/§20, `DESIGN.md`, `docs/table-header-contract.md`. **Skills:** `test-driven-development`, `security-review`, `django-access-review`, `django-perf-review`, `frontend-ui-ux`, `accessibility`.

### 7.1 Backend: `GET /api/plugins/tl_scorecard/team-members/`
An `@action(detail=False, methods=['get'], url_path='team-members')` on `TLScorecardViewSet`:
- **Access:**
  - `leader = self._resolve_leader(request)`.
  - Then **explicitly deny HBPR** for non-staff callers who are not the leader: `if not is_staff_user(user) and leader.id != user.id: raise PermissionDenied`. `_resolve_leader` lets an HBPR reach an in-scope TL, and this endpoint carries wage and leave data, which HBPR must never see ("no payroll", `docs/hbpr-and-scorecard.md:14`).
  - An HBPR-only user calling without `leader_id` already gets 400 from `_resolve_leader`. Add `if is_hbpr_only(user): raise PermissionDenied` first, so the answer is a uniform 403.
- **Members:** `User.objects.filter(id__in=scoreable_member_ids(leader), is_active=True).select_related('profile')`, ordered by last/first name.
- **Per member, a payload:**
  - `id`, `full_name`, `username`, `email`, `job_title`/seniority (read the `UserProfile` fields actually present; use only existing fields).
  - `wage`: `{ gross_monthly: "1234.00" | null, effective_from, status: "ok" | "missing" | "unavailable" }`.
    - Guarded `try: from plugins.payroll.models import WageAssignment except ImportError: status="unavailable"`.
    - Resolve with **one** bulk query for the current month: active assignments overlapping the month for those users. Group in Python. Exactly 1 → ok; 0 → missing; >1 → `missing` with no value. This mirrors `resolve_for_month` rules without N queries; state that in a comment citing `models.py:227-263`.
    - Never expose wage history, `note`, or `created_by`.
  - `leave`: current-year `LeaveBalance` rows (one bulk query) → `{ total_days, used_days, pending_days, available_days }` as DRF decimal strings, plus `upcoming`: approved leave requests from today forward in the current year (one bulk query) with `start_date, end_date, request_type, business_days` (`count_business_days`). Fields only, no `reason` (privacy).
  - `epr`: the current-year `EPRCycle` (one bulk query, `annotate(goal_count=Count('goals'))`) → `{ year, goal_count, goal_setting_done, mid_year_done, final_review_done, next_stage }`.
  - `governance`: `{ open_pip: bool, pip_status, open_idle_flags: int, open_absences: int, pending_promotion: bool }`. Use bulk `values('employee_id').annotate(...)` queries, with the same open/active definitions `_current_state_metrics` uses (read `services.py:459-468` + helpers and reuse those querysets/helpers, don't redefine "open").
  - `meetings`: `last_one_on_one_on` (date or null). **Only when the viewer is the leader or staff.** Never for anyone else (same rule as `_mask_one_on_one`).
- **Serializer:** `TeamMemberSummarySerializer` in `serializers.py`.
- **Query budget:** constant w.r.t. member count (≤ ~10 queries). Pin it with `assertNumQueries` for 1 vs 6 members.

Tests `plugins/tl_scorecard/test_team_members.py`:
1. A TL gets exactly their scoreable members (an Albanian TL in the team is excluded; a member of another team is excluded).
2. Wage visible to the TL for their members; `missing` when the wage starts after this month; `unavailable` when payroll isn't importable (`mock.patch.dict(sys.modules, {'plugins.payroll.models': None})`).
3. A TL cannot pass `leader_id` of another TL → 403 (inherited).
4. An HBPR-only user → 403 with and without `leader_id`, **including an in-scope AL TL id**.
5. Staff with `leader_id` → 200.
6. `last_one_on_one_on` absent for staff? No: present for staff and the leader. Assert the key is absent or null for no other path (since the HBPR is already denied, this just pins the leader/staff case).
7. Query count constant.
8. An employee (non-TL, non-staff) → 403/400 from `_resolve_leader` rules (assert the actual code).

### 7.2 Frontend
1. Tab wiring: add `"team"` to `TLScorecardTab` and `TABS` (`TLScorecardHeader.tsx:13,20-24`; icon `Users`, label "Team") and to the `?tab=` allow-list (`TLScorecardPage.tsx:49`). Render branch → `<TeamTab />`, with its query `enabled: onTeam` (per-tab gating rule, `hbpr-and-scorecard.md:137-139`). An HBPR-only viewer is already redirected before mount.
2. Service: `tlScorecardService.getTeamMembers(leaderId?)` → `GET ${BASE}/team-members/`. Query key `["tl-scorecard","team-members", leaderId ?? "self"]`. Type `TeamMemberSummary` in `types/tlScorecard.ts`.
3. `components/team/TeamTab.tsx`:
   - `StatCard` row: Members, Open PIPs, Open absences, EPR goal-setting done (x/y). Real data only.
   - `DataTable` (`AppColumnDef<TeamMemberSummary>`, `searchColumn="full_name"`, `getRowId`, `onRowClick` opens the panel). Columns:
     - Employee (avatar initials + name + muted title; copy `UserCell` from the admin lift)
     - Leave available (`toDays()` + " d")
     - EPR (3-step mini stepper: dots coloured via `toneSurfaceClass` success/neutral; text label for SR)
     - Governance (badges: "PIP", "Idle ×n", "Absence ×n", "Promotion")
     - Wage (`font-mono tabular-nums`, formatted `Intl.NumberFormat('sq-AL', { style: 'currency', currency: 'ALL', maximumFractionDigits: 0 })`; "—" with a tooltip "No wage for this month" when missing)
     - `actions` (sticky) → `RowActions` with `{ label: "View details", icon: Eye }`
   - Cells compose `TABLE_BODY_CELL_CLASS` via `cn(...)` (trap 1 of the admin lift).
   - `EmptyState` when no members.
4. `components/team/TeamMemberDetailPanel.tsx`: copy the `UserDetailPanel` shell (`Dialog` → `DialogContent side="right" size="panel"`, `DialogHeader` with an sr-only title + identity block, `DialogBody`, `DialogFooter`). It renders **only** the row it was given, **no request on open**. Sections, each a `Fact`-style `<dl>`:
   - **Compensation:** gross monthly wage (large mono figure), effective from. Small muted note "Visible to you as this employee's team leader."
   - **Time off ({year}):** available / used / pending / total, a progress bar (used/total), and the upcoming approved leave list (dates + business days + type).
   - **EPR {year}:** the 3-stage vertical stepper (Goal setting → Mid-year → Final review) with done/next state, goal count.
   - **Governance:** PIP status, idle flags, absences, promotion nomination, each with a tone badge.
   - **Meetings:** last 1:1 date (when present).
   - Footer: "Open records" button → `?tab=records` (optional filter is not supported today; plain navigation only).
5. Tests:
   - `TeamTab.test.tsx`: renders rows; the eye button opens the panel; the panel shows the wage/leave/EPR values; opening fires no extra request (assert the service mock call count stays 1); "Restricted" never appears.
   - `TLScorecardPage` tab test: `?tab=team` renders TeamTab; HBPR redirect intact.

### 7.3 Gate
```
py -3.14 manage.py test plugins.tl_scorecard
cd frontend; npx vitest run src/plugins/tl_scorecard; npx eslint src/plugins/tl_scorecard; node scripts/modal-audit.mjs; node scripts/table-header-audit.mjs; node scripts/control-audit.mjs --strict --exclude=src/plugins/engagement; node scripts/surface-audit.mjs --strict --exclude=src/plugins/engagement
```
Run the `security-review` skill on the diff of `viewsets/scorecard.py` + `serializers.py` before moving on. Browser check in light, dark and 375px as a TL, plus an HBPR attempt (direct API GET → 403).

---

## Phase 8 — Final verification, docs, invariants

1. Full pass (once):
   ```
   py -3.14 manage.py makemigrations --check
   py -3.14 manage.py test
   python -m ruff check --output-format=concise <every changed .py file>
   cd frontend; npx tsc --noEmit; npx vitest run; npm run build
   node scripts/modal-audit.mjs; node scripts/table-header-audit.mjs; node scripts/control-audit.mjs --strict --exclude=src/plugins/engagement; node scripts/surface-audit.mjs --strict --exclude=src/plugins/engagement
   npx fallow dead-code; npx fallow dupes
   ```
   `makemigrations --check` must report **no changes**: no phase adds a model field. If it reports a change, the implementation drifted. Stop.
2. Anti-pattern greps (each must return 0 lines):
   - `grep -rn "from plugins.payroll" plugins/tl_scorecard plugins/engagement apps core | grep -v "except ImportError" -B0` (inspect every hit: each must sit inside a `try` block with `except ImportError`)
   - `grep -rn "params.*format:" frontend/src/plugins/tl_scorecard frontend/src/plugins/engagement` (must be `file_format`)
   - `grep -rn "\"/api/plugins" frontend/src/plugins/notifications frontend/src/plugins/tl_scorecard`
   - `grep -rn "viz-leave-sla\|viz-ot-turnaround\|viz-escalations" frontend/src`
3. Docs (keep them current, no history dumps):
   - `docs/hbpr-and-scorecard.md`: Team tab + wage-visibility decision D1 + HBPR denial; XLSX/PDF export layout; visualize chart list; `epr-progress` endpoint.
   - `docs/engagement-metrics.md`: PDF export section.
   - `.devin/context/PLUGINS/01-payroll.md`: `partition_payable_users`, superuser exclusion, `skipped_users`.
   - `.devin/context/06-DOMAIN-INVARIANTS.md`: TL export settlement column semantics.
   - `CLAUDE.md` Hot Invariants (one line each):
     - "TLs see their scoreable team's current wage only through `tl_scorecard/team-members/` (D1, 2026-10-11); payroll `view` remains HR-only; HBPR denied."
     - "Notification kill-switch is per preference key via `/admin/notifications`; `is_type_enabled` is cached and invalidated by the API + model signals."
   - `AGENTS.md`: session entry with verification counts.
4. `graphify update .`
5. Run the `review` skill on the full diff; implement confirmed findings, reject others with a written reason.
6. **Never commit or push unless the user asks.** Suggested branch `feat/tl-scorecard-reports-notifications` from `main`. If asked to commit, use one commit per phase (`fix(payroll): …`, `feat(reports): …`, `feat(notifications): …`, `feat(tl-scorecard): …`, `feat(engagement): …`).

---

## Self-correction protocol

| Failure | Action |
|---|---|
| Audit or anti-pattern grep hit | Replace it with the plan-specified pattern. No spec for that line → STOP and extend this plan first. |
| A must-stay-green test fails (listed per phase) | The implementation deviated. Fix the implementation, never the test. |
| A new test fails after implementing | Diff spec vs code and fix the code. If the spec is wrong, update this plan section first, then the test, then the code. |
| A line number in this plan doesn't match | Re-locate by symbol name. If the symbol is missing → STOP and report. |
| `makemigrations --check` shows changes | Revert the model edit. No phase needs a migration. |
| A query-count test exceeds budget | Replace the per-row lookup with a bulk `values()`/`annotate` query. Never raise the budget. |
| reportlab chart API error | Check the installed reportlab 5.0.1 source (`py -3.14 -c "import reportlab.graphics.charts.lineplots as m; print(m.__file__)"`). Don't invent kwargs. |
| HBPR walk test or masking test fails | Security regression. Stop, revert the hunk, and re-apply with masking/denial first. |
| Typecheck error | Fix the types properly; no `any`. |
| 3 failed fix attempts on one gate | STOP. Report the failing output, the plan section, and the attempts. |

**Evidence rule:** a phase is done only when its gate output is pasted in the session or PR.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| D1 widens salary visibility | Scope strictly to `scoreable_member_ids`; explicit HBPR 403; no history/notes; `security-review` + `django-access-review` gate; documented as a Hot Invariant. |
| Superuser exclusion hides a real employee who is also a superuser | Accepted per D2. Note it in `01-payroll.md`. Such a person needs a non-superuser account to be paid. |
| Cached kill-switch serves stale state across processes | The cache backend is shared (same as dashboard reference caching); invalidated on API write + model signals; TTL bounds staleness. |
| PDF numbers drift from XLSX/UI | Both builders consume the same aggregate functions (`aggregate_rows`, `monthly_rollup`, `report_kpis`); a test pins cover score == `aggregate_rows`. |
| One-on-one data leaks through the new trend sheet / PDF | `_mask_one_on_one(request, leader, *trend)` before both builders; HBPR export tests assert absence in XLSX and PDF text. |
| reportlab markup injection via free text | `escape()` in every `data_table` cell/paragraph helper; tested with `<b>&`. |
| Cross-plugin static import breaks plugin removal | Notifications admin page lives in the notifications plugin; no TS import across plugins (Phase 8 grep). |
| Vite stale optimizer after new deps | No new npm deps are introduced. If one becomes necessary → stop and ask. |

## Out of scope / follow-ups (recommendations)
- Per-request breach list in the engagement PDF (needs a shared per-request query helper with `compute_type_metrics` to avoid drift).
- Audit-logging TL wage reads (recommended if HR wants a trail; the guarded `audit_log` import pattern exists).
- Server-side CR exclusion for notification preferences.
