# Payroll — End-to-End Reference

Tracked source of truth for how the Payroll plugin works **as a system**: the
month pipeline, the data flow between payroll and the rest of the app, the
permission model, and the immutability guarantees. Rule-level invariants stay
where they are (`docs/workflow-invariants.md`, CLAUDE.md Hot Invariants,
`.devin/context/PLUGINS/01-payroll.md` — local-only). This document is the map
that connects them; when you change payroll, verify the sections below against
the code and update this file in the same change.

Verified against the code as of 2026-11-09 (`plugins/payroll@main`).

---

## 1. What Payroll owns and what it reuses

**Owned by `plugins/payroll/`** (nothing else in the repo owns these):

| Concern | Models / code |
|---|---|
| Operational defaults | `PayrollConfiguration` (singleton, pk=1) |
| Wages | `WageAssignment` (effective-dated gross monthly wage) |
| Legal rules | `PayrollRuleSet`, `PayrollTaxBracket`, `PayrollContributionRate`, `PayrollOvertimeCategory` |
| Its own work calendar | `PayrollWorkCalendar`, `PayrollWorkday` |
| Runs | `PayrollRun`, `PayrollLine`, `PayrollRunEntry` |
| Calculation | `services/calculator.py` (pure), `services/payroll_service.py` (persistence) |
| Exports | `services/export_service.py` |
| Scheduler | `payroll_lifecycle_tick` (`plugin.get_scheduled_jobs`, hourly job `lifecycle`) |
| Lifecycle hooks | `signals.py` (reacts to approval-period closes) |

**Reused, never duplicated:** `auth.User`/`UserProfile`, approved
`OvertimeLog`, approved `StandbyLog`, team data (`get_team_member_ids()`),
approval-period closes (`apps/users/services/approval_periods.py`), working
days (`core/utils/working_days.py`), global `PublicHoliday` (HR side).
Approved leave is **informational only** — it does not prorate payroll.

## 2. The month pipeline (one paragraph, then the details)

1. An employee submits overtime/standby; on create, the source model stamps
   `requested_processing_period` via `resolve_processing_assignment` — normally
   the work-date month, but the **next** open payroll month after that user's
   month has been closed (`ApprovalPeriodClose`), so a late entry is never
   retroactively injected into a closed month.
2. A leader approves the entry. Approved entries with a given
   `requested_processing_period` are payroll's source of truth;
   `OvertimeLog.hours` is already the **paid-block share** (`apps/overtime/paid_blocks.py`),
   which payroll reads unchanged.
3. On the last working day of the month the automatic lifecycle creates the
   draft run (`created_by=None`) for every wage-bearing active user
   (superusers and Managers are never subjects). `generate_draft_run` resolves,
   per user: wage → rule set (effective on month start) → workdays/holidays →
   source entries → `calculate_payroll`, and persists one `PayrollLine` plus
   draft `PayrollRunEntry` rows (the inclusion ledger).
4. Line Managers / Managers close the month for their teams
   (Team Approvals). The run's finalize gate reads that closure; unclosed
   leaders get an urgent reminder hourly.
5. As soon as every run user is closed → early finalize; from the cutoff
   (00:00 on day 2 of M+1, moved to the next working day) the system closes
   whoever is left (`auto_finalize_approval_periods`) and finalizes anyway.
6. `finalize_run` re-locks everything: refuses stale drafts (changed config or
   wage), refuses non-approved or modified source entries, stamps
   `resolved_settlement_period` on each source entry, and flips
   `PayrollRunEntry.status='finalized'` — after which lines, entries, the run
   and the **source OT/standby rows** are all immutable.
7. Exports freeze that state: payslip PDF, consolidated run PDF, 5-sheet Excel;
   later wages/rules/config changes can never alter finalized data.

## 3. Entry selection and settlement periods (the carryover rule)

This is the piece most often misunderstood:

- Payroll selects approved source entries **by
  `requested_processing_period`**, not by work date. A May-dated entry that
  was carried into June settles in June's run: it uses June's wage and rule
  set, but keeps its **May work-date classification** (night/weekend/holiday
  category) and its **source-date holiday lookup**.
- Carry-in ("this run also pays what no earlier run settled"): a run for month
  P also picks entries whose requested period belongs to an already-finalized
  earlier run (`_source_queryset`, `_finalized_periods_before`), tagged in
  `PayrollRunEntry.resolution_reason='target_finalized'`.
- Double-payment is impossible by construction: per-run
  `payroll_run_source_entry_unique` (one row per draft) and the global
  `payroll_finalized_source_unique` partial unique constraint (one finalized
  inclusion per source entry, ever).
- A source entry whose run exists but was **cancelled** is available again:
  `cancel_run` deletes that run's draft entries (§5), so the entry
  falls out of every ledger.
- `ExportService` labels carryover from the **immutable
  `PayrollLine.carryover_breakdown` / `PayrollRunEntry` snapshots**, never from
  live source queries — so reports can't drift from what was actually paid.

## 4. Calculation pipeline (`services/calculator.py`)

`calculate_payroll(PayrollCalculationInput) -> PayrollCalculationResult` is a
pure `Decimal` function — no DB, no settings read. `payroll_service.py` builds
the input and persists the result; this split is an invariant
(context `01-payroll.md`, "Calculation and legal-rule invariants").

Input resolution (`build_calculation_input`):

- **Wage**: exactly one active `WageAssignment` may apply to a user/month
  (`resolve_for_month`); zero or overlapping is a validation error — never a
  zero-wage row. Callers that already resolved the wage pass it in
  (`wage=`) to avoid a second query.
- **Rule set**: `PayrollRuleSet.resolve_for_date(month_start, tax_profile)` —
  newest active effective-dated set, `-pk` tie-break. Multiple
  `is_active=True` sets may legally exist for different `effective_from`
  dates; the Settings UI's *Current today* badge is derived per request
  (`effective_status` annotation), never from `is_active`.
- **Calendar/hours**: `monthly_hours_strategy` — `fixed_174` (174.0),
  `workdays_x8`, `calendar_days × 8`; workdays and holidays from the Payroll
  work calendar, weekday fallback if no calendar year exists.
- **Entries**: overtime (hours, optional start/end times) and standby (hours
  only) — see §3 for selection.

Per-entry classification: `classify_overtime` matches night windows
(`night_start_hour`/`night_end_hour`), weekend/holiday applicability, and the
rule set's multipliers; entries edited mid-hour share the paid block via the
hours that were already persisted. **Missing timestamps** fall back to
`missing_timestamp_fallback_category` and record a warning on the line.
Standby uses **dual rates**: `weekday_standby_hourly_rate` (Mon–Sat) and
`weekend_standby_hourly_rate` (Sunday only; `calculator._is_weekend`);
standby **on holidays** uses the weekday rate (holiday premium is the overtime
multiplier's job, not standby's).

**Banded overtime pricing** (`PayrollRuleSet.overtime_pricing = 'banded'`,
`services/overtime_bands.py`): instead of one category per entry, each entry is
sliced at the rule set's band hours (day `[06,18)`, evening `[19,22)`, night
`[22,06)` wrapping midnight; a minute belongs to the band of its starting
minute) and every slice is priced
`hours × base_hourly_rate × (1 + ot_premium + weekend_holiday_premium + band premium)`.
Defaults of the company schedule: 25 % / 25 % / evening 20 % / night 50 %.
Weekend/holiday = Sunday or a holiday on the entry's own work date, counted
once. `entry.hours` (the paid share) is distributed over the slices pro-rata by
clock minutes (last slice takes the remainder); an entry without both
timestamps is priced whole in the day band with a persisted warning. Breakdown
codes are `ot_day|ot_evening|ot_night` and `wh_ot_*`; the ledger keeps ONE
`PayrollRunEntry` per source entry (amount = sum of slices), and
`entry_details[].slices` carries the detail. Rule sets default to `category`
(legacy path untouched). A draft keeps the rule set it was created with, so
shipping a banded set reprices only runs created afterwards (create it with
`manage.py seed_payroll_banded_rules --effective-from YYYY-MM-01`; it only
creates, never edits an existing set). Finalized runs are repriced ONLY by the
owner-requested exception `manage.py reprice_finalized_payroll --rule-set CODE`:
dry run by default, `--apply --confirm REPRICE-FINALIZED` to write, JSON backup
first (`--restore FILE` undoes it), closed years / differing brackets /
non-reproducible runs skipped, one transaction per run. Never reprice any other way.

**Employment type.** `UserProfile.employment_type` is `full_time` for everyone (read-only, locked checkbox in the user form) and `weekly_contract_hours` is 40. It marks the 40 h contract; an approved overtime request IS the "beyond schedule" declaration, so no weekly accumulator exists and the calculator does not read the field yet. The company table starts the evening band at 19:00 (corrected 2026-11-10 from 18:00). Adding another type (e.g. `half_time`) needs its overtime percentages confirmed first (open question) and a calculator branch.

Gross-to-net: contribution bases (OT/standby contribute per the
`*_is_contribution_bearing` flags), employee/employer social + health with
per-month `cap`/`floor`, prototype tax brackets (rate fraction + optional
fixed amount), and rounding (`half_up`/`half_even`/`down`, precision 0–4).
Defense-in-depth: negative standby rates clamp to 0, non-positive hours are
dropped, both add warnings to `calculation_trace`. Every warning is persisted
on the line (`PayrollLine.warnings`) — surfaced in UI and exports.

## 5. Run lifecycle

Statuses: `draft → finalized`, or `draft → cancelled` (**tombstone**).

- **One active run per period**: partial unique `(year, month)` over
  `draft|finalized`. A cancelled run does NOT block a new one being created by
  hand — but the scheduler deliberately never recreates one for a cancelled
  month (cancel is an admin decision, not a transient state).
- **Draft mutate** (`update/partial_update/destroy/generate/generate_line/
  finalize/cancel`): draft-only (409 otherwise). `year`/`month` are read-only
  on the API — a draft cannot be moved to another period.
- **`generate` (regenerate)**: unscoped (staff/superuser/HR can reach whole
  runs) it replaces every draft line/entry; a scoped caller gets
  `replace_user_ids={their users}` — the scoped regenerate replaces only their
  team's lines and never rebadges the run's `configuration_snapshot`
  (a partial regenerate cannot mask stale untouched lines).
- **`generate_line`**: per-user re-calculation inside a draft; scoped callers
  may only target their own users.
- **Finalize gates, in order** (all inside one locked transaction):
  1. `_ensure_draft_inputs_current` — every calculation key of
     `configuration_snapshot` must equal the live config, and every line's
     wage must still be the one applicable assignment. Stale → 400
     "Regenerate". `_NON_CALCULATION_SNAPSHOT_KEYS` (gate flag + payslip
     branding) are exempt.
  2. TL-closure gate (next section).
  3. `_finalize_run_entries` — per source entry under `select_for_update`:
     source must be `approved` and unchanged since generation (hours/date);
     stamps `resolved_settlement_period` on the source and finalizes the
     ledger row.
- **Cancel** (`cancel_run`): draft-only; deletes the run's lines and draft
  entries and clears `totals` in the same transaction; the run row stays as a
  tombstone so the period's history reads correctly. Old leftover rows from
  before this fix: `manage.py purge_cancelled_run_leftovers` (idempotent, run
  once). The UI shows "Delete draft" for the whole-run destroy case; `cancel`
  is API-only.
- **No reversal/re-calculation story for finalized data**: corrections require
  a new run; if a user has overlapping drafts for different months, each
  finalizes on its own period gates. There is no "reopen" for a finalized run
  (the closed-year lock is the adjacent, year-level concept, item 31).

## 6. TL-closure gate, cutoff and auto-finalize (items 56, 59)

- `PayrollConfiguration.require_tl_closed_before_finalize` defaults **ON**
  (migration `0011`; `prepare_e2e_db` turns it OFF — switch it back on when
  testing the gate in e2e).
- Gate semantics: for every user represented by a `PayrollLine` — including
  base-wage-only employees who submitted nothing — a matching
  `ApprovalPeriodCloseMember` for the run's period must exist. Finalize is
  blocked until then, **unless the cutoff passed**.
- **One closer is enough**: the Line Manager OR the Manager closes a scope
  (`finalize_period`); two separate closes are never required.
- **Cutoff** = `work_date_cutoff(period)` = 00:00 on day 2 of M+1
  (Europe/Tirane), moved to the next working day (`core/utils/working_days.py`;
  shared with the OT/standby creation window). From that instant
  `finalize_run` calls `auto_finalize_approval_periods(period,
  user_ids=<run users>)` first — a system close (`closed_by=None`,
  `scope_type='auto_cutoff'`) for anyone nobody closed — so an absent TL can
  never block payroll. Status endpoint:
  `runs/{id}/period-closure-status/` (also lists, per unclosed user, the
  Line Manager / Manager usernames HR should chase, plus
  `entries_without_source_closure`).
- A user whose month was closed (by a TL or the system) gets
  `requested_processing_period=M+1` for an entry created afterwards
  (`resolve_processing_assignment`) — exactly the carryover rule in §3.
- Late closure costs the leader 15 engagement points (engagement plugin, item 59).

## 7. Automation

**Hourly scheduler job** `payroll.lifecycle` → `payroll_lifecycle_tick`
(`plugins/payroll/services/payroll_service.py`):

1. Company-wide cutoff sweep: closes last month's still-open periods
   (`auto_finalize_approval_periods`).
2. `advance_payroll_period` for the previous and current month — idempotent,
   returns `waiting|drafted|urgent|finalized|failed`:
   - before the last working day: `waiting`;
   - draft on the **last working day** (rolls back, never into M+1),
     `create_automatic_draft_run(created_by=None)` — skipped if any run of the
     month exists (a cancelled one included), no active rule set, or no
     payable users;
   - every run user closed → **early finalize** (never before month-end);
   - cutoff passed → sweep the run's users, regenerate from today's approved
     entries (`auto_finalize_run`, keeping the draft's user set), finalize as
     the system;
   - otherwise: one urgent reminder **per unclosed leader** (dedupe key
     `tl-urgent-close:<YYYY-MM>:<user id>`, always-on notification type).
3. A failed finalize never kills the run or the tick: logged, draft kept,
   HR + administrators notified once per run (`hr_payroll_auto_finalize_failed`).

**Close-signal hook** (`plugins/payroll/signals.py`, connected from
`PayrollPlugin.ready()`; deliberately **not** in `apps/users` — core must not
import a plugin): on a new non-`auto_cutoff` `ApprovalPeriodClose`, run
`advance_payroll_period` after commit — that is what makes early finalization
instant rather than hourly. It swallows and logs its own errors. Tests that
disconnect must connect in teardown. Plugin `disable()` disconnects.

**Never retroactive**: once the cutoff passed, a month without a run is left
to an administrator (manual create stays as the staff path).

## 8. Permissions and scope (`plugins/payroll/viewsets.py`)

Two independent axes — the grant decides what you may *do*; the scope decides
whose *data* you may see:

| Role | View/read scope | Wage write | Run mutate (%actions) | Notes |
|---|---|---|---|---|
| Superuser | unrestricted | yes (`is_staff` implied) | yes | never a payroll *subject* |
| Staff (admin) | unrestricted | yes | yes | never a payroll *subject* |
| HR (`profile.is_hr`) | unrestricted (reads + exports) | **yes** (`wage_access.py`) | **no** (`can_mutate_runs`) | lifecycle is automatic; HR keeps `manage` for wages |
| Payroll `manage` holder (non-HR) | **scoped**: self + `get_team_member_ids()` | no | scoped regenerate only | whole-run actions refused via `_ensure_unrestricted()` |
| Everyone else with `view` | own rows only | no | no | |

- Scope helper: `_allowed_payroll_user_ids` returns `None` ONLY for staff,
  superusers and HR; otherwise `{self} ∪ team member ids`. Every salary
  queryset and serializer (lines, payslip, exports, closure status) must
  derive from this one helper — "parent scope is not child scope": reaching a
  run never implies seeing its every line (`_scoped_lines(run)` re-applies the
  scope; `PayrollRun.notes` is hidden from team scope and not searchable).
- Whole-run actions refused to scoped holders: `create/update/destroy/
  finalize/cancel/exports/period_closure_status`. Scoped members DO get:
  scoped `generate` (their users, `replace_user_ids`) and scoped
  `generate_line`.
- `GET runs/scope/` returns `run_scope` (company|team), `can_mutate_runs`,
  `business_year` (server clock via `business_today()`, never the browser),
  and `years` — the payroll list defaults its year filter from this.
- **Never payroll subjects**: superusers (item 42) and Managers
  (Manager = `italian_tl_user_ids()`, item 49). Enforced in
  `WageAssignment.clean`, create-serializer validation, `eligible_users`,
  querysets, the wage importer, `partition_payable_users` and
  `generate_line`. TLs keep wage **read** for their scoreable team only
  through `tl_scorecard/team-members/` (item 49/TL wage visibility).
- Plugin grant manifest: `view/manage/export` → role `hr` (codified,
  survives `seed_plugin_permissions --reset`); `configure` (rule sets,
  calendar, configuration) → admin-only.
- All config/ruleset/calendar/wage/run actions write an `AuditLog` row
  (values JSON-safe).

## 9. Immutability and freeze guarantees (the whole list)

| Frozen at finalize | How |
|---|---|
| `PayrollLine` | `save()`/`delete()` refuse any write while the run is finalized; Django admin mirrors via `has_delete_permission`/`delete_model` |
| `PayrollRunEntry` | immutable except the draft→finalized transition itself; `delete()` refuses finalized rows or rows of a finalized run; admin read-only |
| `PayrollRun` status/year/month/notes | read-only once finalized (`PayrollRunAdmin`) |
| **Source OT/standby entries** | `/api` edit + delete refuse via `_ensure_not_in_finalized_payroll` in `apps/overtime/viewsets.py` and `apps/standby/viewsets.py` (and their Django admin) — a paid entry cannot be rejected, re-paid, edited or deleted |
| Paid-block hours | `PayrollRunEntry.hours` is the freeze authority: `frozen_log_hours` restores overtime shares paid; later siblings only get what was left of the block (item 23) |
| Rule set referenced by any run | immutable (clone/version for legal changes); `PayrollRuleSetAdmin` blocks edits + child inline mutations when referenced |
| Wage honored at finalize | `_ensure_draft_inputs_current` (§5) |
| Year | once the year is closed (`ClosedYear`), OT/standby of that year refuse every write for everyone — payroll finalize of a past year additionally requires the rows to exist (item 31; `year_close` blockers) |

To change a paid mistake: cancel nothing — a finalized month stays; correct
via the next run's carry-in or a new draft run, per product decision.

## 10. Work calendars and holidays (three systems, one rule)

- **Payroll work calendar** (`PayrollWorkCalendar/Workday`) is **authoritative
  for payroll calculations**. Seeded for Albania 2026
  (`seed_payroll_calendar`). Regenerate uses fixed-date holidays; manually
  added non-fixed-date holidays survive regenerate (update_or_create only
  touches fixed-date entries). CRUD + `generate_year` (atomic) +
  `month_summary` + `sync_holidays`.
- **HR global holidays** (`PublicHoliday`) feed leave counting, OT/standby
  window math (`working_days.py`) and year-close readiness.
- **Two-way sync** (`apps/dashboard/services/holiday_sync.py`,
  `manage.py sync_payroll_holidays`, wired into `docker/entrypoint.sh` under
  `RUN_MIGRATIONS=1` — since launch-review C-1, **not** into
  `PayrollPlugin.ready()`). Dev box / after enabling Payroll: run
  `py manage.py sync_payroll_holidays` by hand. Sync is
  `get_or_create`-based (no worker races), HR names are authoritative, missing
  HR holidays are backfilled, and **fail-closed** when Payroll is disabled:
  holiday CRUD answers `status: skipped, reason: payroll_plugin_disabled`
  instead of an error.

## 11. Exports (`services/export_service.py`)

| Export | Endpoint / gate | Content |
|---|---|---|
| Payroll Excel | `export_excel`, `export` grant, finalized + unrestricted | 5 sheets: Summary, Employee Breakdown, Overtime Detail, Tax & Contributions Detail, Carryover Detail; percentage columns; employee name column A is formula-injection-escaped (`_excel_text`) |
| Consolidated run PDF | `export_pdf`, same gates | Cover page (same summary metrics as Excel Summary — shared `_run_summary_metrics`, cannot drift) + every employee's full payslip, one per page |
| Per-user payslip PDF | `payslip`, `export` grant | Gross → contribution bases → employer contributions (informational) → employee deductions → tax → net; warning banner when `validation_status != 'official'` |
| Draft preview | per-line Generate button + draft preview endpoint | draft runs only |

Hard rules: all human text in ReportLab goes through `_md()` (Paragraph
parses markup — a stray `<` once crashed every payslip, and an `<img src>`
would be fetched); payslip branding (`organization_name`, `payslip_footer`)
comes from the run's snapshot via `run_branding(run)`, never live config.
No PDF-extraction tests exist: PDF tests are smoke (`%PDF` + no exception);
assert content only through the pure helpers.

## 12. Connections to the rest of the app

| System | Direction | Mechanism | When Payroll is off |
|---|---|---|---|
| Overtime / Standby | core → payroll | `requested_processing_period` (`resolve_processing_assignment`), `resolved_settlement_period`, `_ensure_not_in_finalized_payroll` guards, PROTECT FKs | finalized-source guards stay ON (`ImportError`-only imports — a disabled plugin still protects finalized data) |
| Overtime paid blocks | core → payroll | `paid_blocks.py` reads finalized `PayrollRunEntry.hours` to freeze paid shares | `frozen_log_hours` returns empty |
| Approval periods | core ↔ payroll | TL closes gate finalize; payroll auto-closes at cutoff; close signal triggers early finalize (payroll owns the signal) | signal disconnected (`PayrollPlugin.disable()`); closes still work |
| Working days | core → payroll | `core/utils/working_days.py` = cutoff date, month-end draft day, year lifecycle | unaffected |
| Holidays | core ↔ payroll | `holiday_sync` two-way (§10) | skipped gracefully |
| Data Import | plugin → payroll | `wages` importer (targets `wages` only; rejects Managers/superusers; blank cell = leave alone); `generate_draft_payroll` option creates **draft** runs only, payroll failure = skip, never rollback of committed rows | target gated `payroll_plugin_disabled()` |
| Notifications | plugin → payroll | `hr_payroll_auto_finalized`, `hr_payroll_auto_finalize_failed`, `tl_period_closure_urgent` (imported lazily; ImportError = silent no-op) | no notifications |
| TL scorecard | plugin → payroll | TL reads team wages via `tl_scorecard/team-members/` (`unavailable` while Payroll disabled); EPR/goal content never touches payroll | wage shown as `unavailable` |
| Year close | plugin ↔ payroll | readiness blockers: a draft run of year Y, or approved OT/standby of Y with no finalized entry — no `ClosedYear` until payroll is settled; year-close exports reuse `generate_payslip_pdf` / consolidated run exports, `safe_sheet_title()` everywhere | checks guarded (`_payroll_models()` returns None) |
| Reports/HR exports | core → payroll | settlement labels from **snapshots** (§3), not live queries; sheet layouts position `code` as last column (positional consumers, item 21) | still works |
| Backup/restore | core → payroll | payroll models are ordinary fixtures; guard test `test_backup_coverage_guard` fails on any new model without a readiness answer | unmoved |

## 13. Enable / disable / remove

- URLs are mounted statically at process start for every discovered plugin —
  enabling needs **no restart**, but a disabled plugin refuses its API for
  **everyone, staff included** (`PluginEnabledMixin` inside
  `PluginPermissionMixin`; one uncached query per request on purpose — tests
  must not cache Plugin rows, TestCase rollback fires no signals).
- `remove_plugin payroll --dry-run` lists every cross-import (several mature
  `ImportError`-guarded reach-ins exist, per design). Known dev-only
  exceptions: `prepare_e2e_db` imports payroll unguarded; core must never add
  another one (Hot Invariant: fail closed, `except ImportError` only).
- Core users/OT/standby/calendar data survive un+reinstall.
- `Seed/start commands`: `seed_payroll_rules` (Boshti reference 2026 —
  `validation_status='reference'`, feeds the payslip warning banner,
  **not official**), `seed_payroll_calendar`, `sync_payroll_holidays`,
  `auto_finalize_approval_periods`, `purge_cancelled_run_leftovers`,
  `reopen_year` (year lock, audited, reason required).

## 14. Frontend surface (`frontend/src/plugins/payroll/`)

- Pages: `PayrollWagesPage`, `PayrollRunsPage`, `PayrollRunDetailPage`,
  `PayrollCalendarPage`, `PayrollSettingsPage`. Components: run actions,
  lines table, summary cards, rule-set editor dialog
  (`PayrollRuleSetEditorDialog` — every rule field, atomic
  `rule-sets/{id}/atomic-save/` contract, clone child-count check),
  config form, assign-wage dialog, automated-lifecycle notice.
- Navigation: **hardcoded** nav items in `useAdminNavItems.ts` (group
  "Payroll", `pluginName: "payroll"`, `fullAdminOnly: true`) — THIS plugin
  does not use `admin-sidebar-nav` injection. HR reaches runs/wages through
  `/hr/payroll/*` routes (`layout: "hr"`, same components, self-adjusting via
  `canManage("payroll")`); sidebar entries for HR live in
  `useVisibleNavItems.ts`. Calendar/Settings have no HR route (configure is
  admin-only).
- Service layer: `services/payrollService.ts` with `BASE = "/plugins/payroll"`
  (axios `baseURL` already ends in `/api`). Query keys include every
  result-changing parameter (`usePayrollRunScope`, year, page_size).
- Rule-set status badge is derived server-side (`effective_status`);
  superseded sets hide behind a "Show superseded" toggle and reappear
  automatically when the newer version is deleted.
- The lifecycle notice + disabled Finalize button answer to
  `can_mutate_runs` and `cutoff_passed` from closure status — never encode
  the gate logic client-side a second time.

## 15. Gotchas (historically hard-won; each is pinned by tests)

0. **A rule-set field must be added to `clone` AND the atomic-save parent serializer.** `clone` copies an explicit field list and version-mode atomic-save builds from `PayrollRuleSetCreateSerializer`; a missed field silently reverts a cloned set to defaults (`test_overtime_bands.RuleSetBandedFieldsTests`).
1. **"This month" vs lifetime**: any new "this month" payroll figure must read
   the monthly series, never `global_stats` (item 39).
2. **`py -3.14 manage.py …` always** — Django 6.1.1 pins; `python` is 3.11 +
   5.2 and lies.
3. **A draft month's finalize test in the past** must patch
   `django.utils.timezone.now` to before the cutoff, or the auto-cutoff
   sweeps the gate into green (item 56 test note).
4. **Multipart posts need the explicit multipart header** on `api.post` or
   Django sees an empty `request.FILES` (e2e-verified 2026-10-06 rule).
5. **`PayrollRunEntry` draft rows block deleting their source entries and
   users** (PROTECT) — that is why `cancel_run` is a tombstone that deletes
   its own rows (item 57) and why old cancelled runs needed
   `purge_cancelled_run_leftovers`.
6. **Wage-less team members do not 400 the run** — they land in
   `skipped_users` (`partition_payable_users`); check that response, not the
   exception log.
7. **The importer's `wages` target and the pages enforce the same subjects
   rule**: superusers and Managers are refused everywhere, closed by default;
   do not "fix" a 400 by opening the roster.
8. **e2e payroll story** (item 47): move `db.e2e.sqlite3` aside →
   `prepare_e2e_db --settings=config.settings_e2e` → `seed_e2e_data` →
   `seed_payroll_rules`; `prepare_e2e_db` turns the TL gate OFF, so switch it
   on to test the gate. A leftover MFA enrolment can break the auth token
   endpoint on old e2e DBs (fixed 2026-10-26, still re-seed when in doubt).
9. **Query-budget pins exist** (`test_generate_finalize_budget.py`):
   `PayrollLine.objects.create` per user is deliberate (bypassing
   `PayrollLine.save()` with `bulk_create` skips the immutability guard).
10. **Do not re-add `natural_foreign` to site backup dumps** — payroll
    identification is PK-based (`docs/workflow-invariants.md` item 55).

## 16. Invariants index (where the rule fragments live)

| Topic | Where |
|---|---|
| Month closure, one closer, date-2 auto-cutoff | `docs/workflow-invariants.md` item 56 (+ §Payroll and TL closure) |
| Cancel = tombstone, leftovers purge | item 57 |
| Banded overtime pricing (modes, slicing, forward-only rollout) | §4 above, `plugins/payroll/tests/test_overtime_bands.py` |
| Automatic lifecycle, working-day dates, early finalize | item 59 |
| Superusers are never payroll subjects | item 42 |
| Manager not a payroll subject; wage write access | item 49 |
| Overtime paid blocks & frozen hours | item 23 |
| Finalized-source guards, status/owner server-decided | item 26 |
| Closed-year lock, year close engine, Previous Years | items 31–33 |
| TL scope preserved (`get_team_member_ids()`), HR isolation | CLAUDE.md Hot Invariants |
| Plugin audit checklist, fail-closed imports | CLAUDE.md + `docs/workflow-invariants.md` item 13 |
| Employee code as last sheet column | item 21 |
| Payroll draft/access history | CLAUDE.md "Payroll access and drafts" |

Pinned test suites: `plugins/payroll/tests/` (in particular
`test_backend_review.py`, `test_disabled_plugin_gate.py`,
`test_cancel_run_cleanup.py`, `test_generate_finalize_budget.py`,
`test_wage_write_permission.py`), `apps/overtime/test_sim_payroll.py`,
`apps/overtime/test_sim_adversarial.py`, `apps/permissions/test_row_ownership_matrix.py`.

## 17. Verification commands

```bash
# backend (repo root)
py -3.14 manage.py check
py -3.14 manage.py test plugins.payroll
py -3.14 manage.py makemigrations --check --dry-run
py -3.14 -m ruff check plugins/payroll

# frontend (frontend/)
npx vitest run src/plugins/payroll
npx tsc -b
npx eslint src/plugins/payroll
npm run build

# lifecycle / removal
py -3.14 manage.py remove_plugin payroll --dry-run
```
