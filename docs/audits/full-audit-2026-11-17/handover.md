# Handover: full audit and code review, 2026-11-17 (for the implementing model)

Read this file first, then open source only at the cited lines. HEAD `da37af2a` on `main`.
Nothing tracked was changed by this audit. One leftover: `plugins/year_close/test_zz_audit_probe_20261117.py`
is an EMPTY probe file (deleting it was not permitted in this session). Delete it; never commit it.

Earlier rounds are done and are not repeated here: `handover-full-audit-2026-11-16.md` (all items
implemented, see `docs/audits/full-audit-2026-11-16/progress.md`), `handover-full-audit-2026-11-13.md`,
`audithandover.md`. This round goes deep on what the user asked for: **year closure**, **exports**,
**permissions**, and **things that will break later**. The year-close engine (`plugins/year_close`)
had never been audited end to end. Most findings are there.

## Progress (implementation, branch `fix/audit-2026-11-17`, uncommitted until the owner asks)

| Item | Status | Tests |
|---|---|---|
| C1 + D3 + M1 + L4 | DONE: `closer.supersede_if_reopened` (a ready set of an unfrozen year is superseded, rebuilt as v N+1, by scheduler and command); purge refuses on archive/database count mismatch (`retention.live_count`, `_count_mismatch`) and on an unconfirmed rebuilt set (`needs_confirmation`, `confirm_snapshot`, `POST archives/confirm-set/`, Archives page banner + ConfirmDialog); ineligible close wrapped in `atomic` (M1); retry branch collapsed (L4). Browser click-through pending (end of batch) | `plugins/year_close/test_reopen_guard.py` (8), `ArchivesPage.test.tsx` (+2); year_close suite 85 OK |
| H1 | DONE: `payslips/<username>/<year>-<month>.pdf`, `_finalized_lines` selects `line__run`, a duplicate name raises (file fails, never silently overwritten) | `PayslipNamingTests`, renamed `test_payslip_files_are_named_by_username_and_month` |
| H2 (D1) | DONE: `payroll_service.payroll_exclusion_reasons` (superuser, Manager, deactivated, no wage for the month); readiness blocks only payroll subjects, the rest is one warning with counts per reason | `ReadinessTests.test_approved_rows_of_people_payroll_never_pays_are_a_warning`; existing block test now gives the member a wage |
| H3 | DONE: `tl_scorecard.snapshots.snapshot_rosters()` is the one rule (freeze job + readiness); `archive_sets.december_snapshot_state` -> former leaders are a warning; unused `december_snapshot_blockers` removed | `test_archive_sets.DecemberRuleTests` (2); year_close + tl_scorecard 790 OK |
| H4 | DONE: audit row + `YearCloseAttentionNotice` (superusers, after commit, dedupe by reasons hash) only when blockers change; failed builds notify too; `years_to_process()` retries started-but-unfinished and reopened years, never-started older years stay a command decision. NOT done: `check_year_start` (payroll plugin) does not show the year-close state, because payroll must not import year_close | `BlockedYearTests` (5) |
| H5 | DONE: `candidate_pairs` uses `leader_user_ids()` (+ deactivated team leads as before) | `EmployeesAreNotLeadersTests` |
| M1-M4 + dress rehearsal | DONE: M1 (with C1); M2 `StandbyLogAdmin.has_change/delete_permission` false for a STORED closed-year row (view only, 403 on delete, bulk delete refused, cannot move out); M3 `builder.assign_filenames` (ids only on colliding names) + closer refuses duplicate names; M4 `closer._count_drift` before the freeze, drift marks bundles pending and fails the set, next run rebuilds. Section 7 item 1: `YearCloseDressRehearsalTests` | `apps/standby/test_admin_closed_year.py` (4), `BundleNameCollisionTests` (2), `ChangedDuringBuildTests` (1), `YearCloseDressRehearsalTests` (1); year_close 99 OK |
| M6 | DONE: snapshot rows return `standby_completed` (a count) instead of `count * 8` "hours" (no frontend consumer); previous-period trend built by the same `_window_filters` (teams/users/status applied) | `plugins/analytics/test_overview_figures.py` (2) |
| M7 | DONE: `_export_range_error` shared by the synchronous export and export jobs (400 over 400 days, reversed or malformed) | `plugins/analytics/test_export_range.py` (3) |
| M9 | DONE: leave edit = atomic, `lock_person`, row re-read with `select_for_update`, `serializer.instance` = locked row; overtime edit adds `lock_person`; standby edit now atomic with person + row lock (L5 parity) | `EditLockOrderTests` (3) in `apps/leave_management/test_concurrent_create.py`; leave+overtime+standby 500 OK |
| M10 | DONE: `_apply` recounts from the locked row and returns the stored count | `test_dates_changed_after_the_scan_are_the_ones_counted` |
| M5 | DONE: `leaveService.getAllRequests` follows every page (1000 per page); `useLeaveQueries` uses it, so the page counts, table, CSV and JSON all see every row. Browser click-through pending (end of batch) | `leaveService.test.ts` (1500 rows over 2 pages); leave page tests 33 OK; tsc OK |
| M8 (D2) | DONE: correction to the finding: engagement was ALREADY Tirane-aware (`month_bounds`/`_local_midnight`); only the scorecard was UTC. `tl_scorecard.services._starts` (Tirane midnight) for every `submitted_at` bound, `_local_date` and `_business_days_elapsed` use `business_tz()`. Forward-only by construction: frozen snapshots are read, never recomputed | `plugins/tl_scorecard/test_business_month_windows.py` (2); tl_scorecard + engagement 898 OK |
| L1 | DONE: command catches DRF `ValidationError` (CommandError, no traceback); its message now says what really happens (superseded at the next hourly run, or `close_year --year` now) | `test_reopen_command_refuses_a_blank_reason_cleanly` |
| L2 | DONE: `leader_summary` uses `leader_user_ids()` once | `LeaderSummaryQueryBudgetTests` (same query count for 1 and 5 leaders) |
| L3 | DEFERRED: hashing a multi-GB set in the request needs a background "verify" step (design, not a one-line fix). `confirm_snapshot` (D3) hashes too, so the cost now also appears there | |
| L4 | DONE (with C1) | |
| L5 | DONE: standby CSV user = full name or username | `test_export_names_a_user_without_a_full_name_by_username` |
| L6 | DONE: `my_team_members` (2 places) and the three report export errors log the exception and return a generic message. Left as is: `apps/plugins/viewsets.py` (staff-only plugin admin, 4 places) and `warm_cache` (CLI) | `test_team_members_error_text.py` |
| L7 | DONE and UPGRADED: worse than filed. `PayrollRunEntry.source_id` is a plain integer, so nothing stopped the 3-year purge deleting overtime/standby that 5-year payroll points at; the payroll Excel paid-block sheet then skipped them silently. `retention.payroll_hold` refuses the purge, `category_state` returns `hold` and `removable=false`, the Archives page shows the reason | `PayrollHoldsOvertimeTests`, `ArchivesPage.test.tsx` (+1) |
| L8 | OWNER: delete untracked scratch files incl. `apps/standby/test_tmp_audit_repro.py` and the empty `plugins/year_close/test_zz_audit_probe_20261117.py` | |
| Docs / plugin relationships / backup plugin | DONE: `docs/workflow-invariants.md` items 31, 32, 77 corrected + new item 88; `CLAUDE.md` router rows (year close) + Year close hot invariant + standing gates (dress rehearsal); runbook "Year-close checklist"; `docs/site-backup-and-restore.md` (restore before a close); `docs/hbpr-and-scorecard.md` (Tirane month windows); local `.devin/context/PLUGINS/10-year-close.md`, `07-backup-restore.md`. Plugin relationships: no core->plugin import added, no frontend cross-plugin import, cross-plugin Python calls are guarded (payroll and tl_scorecard behind `payroll_available`/`scorecard_available`, notifications behind `ImportError`); `apps.plugins`, notifications, site_backup, ticket_kpi coupling = 366 OK. Backup plugin: no model, migration or signal receiver added; coverage guard green; `makemigrations --check` clean | |

### Final verification (2026-11-18, all on branch `fix/audit-2026-11-17`, nothing committed)

| Gate | Result |
|---|---|
| `py -3.14 manage.py test --parallel 4` | 4971 tests OK, 2 skipped (PostgreSQL-only race tests); baseline was 4927 |
| `makemigrations --check` | No changes detected (no new model or migration) |
| `ruff check` on every changed/new Python file | clean |
| `npx tsc --noEmit`, eslint on changed files | clean |
| `npx vitest run` | 680 files, 4400 tests passed |
| modal, control, surface, table-header audits (`--strict`) | all exit 0 |
| `npm run build` | OK |
| Browser (e2e DB, real clicks) | Archives: `reopen_year` + `close_year` built v2 (v1 shown superseded); banner shown; Confirm rebuilt archive -> dialog -> Confirm archive -> POST `archives/confirm-set/` 200, toast, banner gone; no console errors. Leave page (employee): list request is `page_size=1000&page=1`, CSV = header + 2 rows = table rows = "Pending 2" card; no console errors |
| Not run | Full Playwright e2e suite; the PostgreSQL CI lane (the 2 race tests); the 1500-row leave case in a browser (unit-tested only) |

## 0. Baseline (measured today, before any change)

| Gate | Result |
|---|---|
| `py -3.14 manage.py test --parallel 4` | 4927 tests, exit 0 |
| `py -3.14 manage.py check` | no issues |
| `py -3.14 manage.py makemigrations --check --dry-run` | No changes detected |
| `ruff check apps plugins core config` | clean on tracked files (hits only in untracked scratch: `apps/standby/test_tmp_audit_repro.py`) |
| Frontend tsc / vitest / build, browser, e2e | NOT run this round (no frontend change proposed needs them before the fix) |

How findings were proven: code read at the cited lines, plus a throwaway Django test probe
(`plugins/year_close/test_zz_audit_probe_20261117.py`, now emptied). Probe results are quoted as
"Proven:". Findings marked "Code-verified" were read, not executed.

## 1. Verdict

1. **One CRITICAL** (C1): reopening a closed year and closing it again re-freezes the year with the
   OLD archive. The retention purge later deletes database rows that were never archived.
2. **Five HIGH**, all in the year-close engine: payslips overwrite each other in the archive (H1),
   three ways a year can be blocked forever with no way out (H2, H3, H4), and employees treated as
   leaders when files are assigned to bundles (H5).
3. Year 2026 becomes closable on **1 February 2027**. H2 and H3 will very likely block it (any
   Manager, superuser, or wage-less person with approved overtime; any leader who stopped leading
   during 2026). Fix C1, H1-H5 before 1 February 2027.
4. Exports and permissions are in good shape after the 2026-11-16/17 work. The remaining export
   problems are a silently truncated leave CSV (M5), a fabricated standby figure (M6) and an
   uncapped synchronous analytics export (M7).

Severity scale: CRITICAL = data loss, security hole, wrong numbers, lockout. HIGH = integrity risk
or user-visible breakage without data loss. MEDIUM = latent correctness or operations risk.
LOW = polish, consistency, perf.

## 2. CRITICAL

### C1. Reopen then re-close keeps the old archive; the retention purge then deletes unarchived rows

- Where: `apps/users/management/commands/reopen_year.py:38-40` prints "The year-close snapshot (if one
  exists) is superseded; the next close builds a new version", but NOTHING sets
  `YearSnapshot.status='superseded'` (grep: the value exists only in `models.py:22`, the migration and
  `closer.py:45`). `plugins/year_close/services/closer.py:34-35` returns a `ready` snapshot untouched;
  `closer.py:253-255` (`process_close_year`) returns early on `ready`. With `--retry`,
  `closer.py:141-144` skips every `ready` file, so no bundle is rebuilt, then `_finalize`
  (`closer.py:242`) freezes the year again.
- `plugins/year_close/services/retention.py:165-171` verifies only that files match their own sha256,
  never that the archive still matches the database, then `_plan` deletes by year
  (`retention.py:203-217`).
- Proven: close (1 overtime row, archive ready, frozen) -> `reopen_year` -> add a second overtime row
  -> `process_close_year()` and `close_year()` change nothing (snapshot `ready` v1, year NOT frozen)
  -> `close_year(retry=True)`: status `ready`, year frozen, bundle MANIFEST `overtime: 1`, database
  `overtime rows: 2`.
- Would break if: anyone uses the documented reopen path (the only sanctioned way to fix a closed
  year). (a) The year stays unfrozen forever unless someone knows to run `--retry`, because the
  scheduler skips it. (b) After `--retry` the frozen evidence differs from the frozen data. (c) Three
  years later the purge deletes the rows that are not in the archive: permanent data loss.
- Fix: in `reopen_year` (service, `apps/users/services/approval_periods.py:126`), or better in a
  year_close receiver so `apps/users` never imports the plugin (plugin removal safety: use a signal
  such as `year_reopened`, same pattern as `leader_link_changed`), mark every non-superseded
  `YearSnapshot` of that year `superseded`. Then `_lock_snapshot` creates version N+1 and builds every
  file fresh. Remove the misleading line from the command or make it true. Retention: refuse a purge
  when the ready snapshot's `completed_at` is older than the latest `reopen_year` audit event for that
  year (cheap), and recompute `pending_counts(year)` against the manifest counts before deleting
  (counts must be equal, otherwise refuse with both numbers). Owner decision D3 (section 8): ALSO
  require a superuser to confirm the rebuilt set after a reopen before any purge of that year.
- Test first (`plugins/year_close/test_year_close.py`): the proven sequence; after the fix the second
  close produces version 2, its bundle counts 2 rows, and the year is frozen. A purge with a manifest
  count that differs from the database is refused.
- Docs: `docs/workflow-invariants.md` items 31-33 and 77 (reopen supersedes the set; purge checks
  counts), CLAUDE.md "Closed year is frozen" bullet.

## 3. HIGH

### H1. Year archive keeps one payslip per person, not twelve

- Where: `plugins/year_close/services/builder.py:376-379` names every payslip
  `payslips/{username}.pdf`; `builder.py:433-437` writes them into a dict keyed by that name, once per
  finalized line of the year (one per month).
- Proven: three finalized lines (Jan, Feb, Mar) for one person: `counts.payslips = 3`, ZIP contains
  only `payslips/yc_member.pdf`, content is the March payslip.
- Would break if: any year is closed. Eleven of twelve payslips per person are missing from the
  frozen evidence, while the bundle MANIFEST says 12. After the payroll purge (5 years) they are gone.
  The existing test `test_payslip_files_are_named_by_username` (`test_year_close.py:142`) pins the
  bug's name format and an empty `PayslipNamingTests` class sits below it.
- Fix: name `payslips/{username}/{year}-{month:02d}.pdf` (month from `line.run.month`; add
  `select_related('line__run', 'line__user')` in `_finalized_lines`, `builder.py:358-373`). Assert in
  `build_bundle` that the number of payslip files equals `counts['payslips']`. Rewrite the name test;
  fill `PayslipNamingTests` with two lines of one user in two months.
- Already-closed years: none in production yet (first close is 2026, from 1 Feb 2027). If one exists
  in any environment, rebuild it after C1 is fixed.

### H2. Approved overtime of people payroll never pays blocks the year close forever

- Where: `plugins/year_close/services/readiness.py:84-98` blocks the close for every approved
  overtime/standby row of the year that is not in a finalized payroll run. Payroll never generates
  lines for: superusers and Managers (`plugins/payroll/services/payroll_service.py:460-479`,
  `partition_payable_users`), users with no active `WageAssignment` or a wage that does not cover the
  month (same function, `:474-477`; and `_payable_wage_users` `:902-908`), and inactive users
  (`:908`, `is_active=True`). Overtime create has no rule stopping these people from logging.
- Proven: a superuser's approved overtime: `partition_payable_users` returns `payable=[] skipped=[]`;
  readiness blocker "1 approved overtime entr(y/ies) of 2025 are not in any finalized payroll run."
  The same holds by code for Managers, wage-less employees, and anyone deactivated before the run.
- Would break if: one Manager logs and gets approved one overtime hour, or one employee is missing a
  wage for one month, or leaves before their last entry settles. There is no override: the only way
  out is to reject or delete approved history, which is the opposite of frozen evidence.
- Fix (owner decision D1 = warning only, section 8): count only rows of payroll subjects as blockers. Reuse one helper so
  readiness and payroll cannot drift: e.g. a `payroll_subject_ids(year, month)` next to
  `partition_payable_users`, and in readiness list the rest as a WARNING with the reason ("approved
  overtime of 2 people who are not payroll subjects: Managers/superusers/no wage"). Readiness must
  import it guarded (`ImportError` only), as today.
- Test first (`test_year_close.py` `ReadinessTests`): superuser, Manager, wage-less and inactive
  user each with one approved row -> no blocker, one warning naming the count.

### H3. A leader who stopped leading during the year blocks the close forever

- Where: `plugins/year_close/services/archive_sets.py:226-247` (`december_snapshot_blockers`) wants a
  final December snapshot for EVERY leader with any snapshot in the year.
  `plugins/tl_scorecard/snapshots.py:30-82` writes snapshots only for current leaders
  (`leader_user_ids()`) with scoreable members (`:73-75`). The blocker's own advice ("run manage.py
  freeze_scorecard_months") cannot fix it.
- Proven: a user with a June snapshot who is no longer a leader: `freeze_scorecard_months(month=Dec)`
  writes 1 (the current leader), readiness still says "1 leader(s) have no final December 2025
  scorecard snapshot".
- Would break if: any Line Manager is demoted, deactivated, or has an empty team in December. This is
  routine (item 65 promotions, item 83 offboarding).
- Fix: require December only for leaders who are still leaders with scoreable members at the December
  freeze moment, i.e. the same set `freeze_scorecard_months` would write. Move the "who needs a
  snapshot for month M" rule into one function in `tl_scorecard/snapshots.py` and call it from both
  places through the existing guarded import. Former leaders become a warning ("2 former leaders have
  no December snapshot; their last frozen month is used").
- Test first: the proven case gives no blocker and one warning; a current leader with members and
  no December snapshot still blocks.

### H4. A blocked year fails silently, spams the audit log, and is abandoned on 1 January

- Where: `closer.py:248-256` runs hourly; every blocked run re-runs readiness (including
  `bundles_for_year`, `readiness.py:413-419`), rewrites the snapshot and writes an audit row
  `year_close_blocked` (`closer.py:84-87`). `plugins/year_close/notification_types.py` has only
  `ArchiveRemovalNotice`: nobody is told. `process_close_year` only looks at `business_today().year - 1`,
  so on 1 January of the next year a still-blocked year is never tried again.
- Would break if: H2 or H3 happens (likely). Result: 24 audit rows a day, no notice, and a year that
  silently never closes.
- Fix: write the audit row only when the blocker list changes (compare with `snapshot.readiness`).
  Add a `YearCloseBlockedNotice` to superusers, deduplicated per year and blocker set (follow
  `ArchiveRemovalNotice.dedupe_key`). Make `process_close_year` try every eligible year from the
  oldest year with data up to last year that has no ready snapshot and no `ClosedYear`. Add the
  blocked state to `check_year_start` output.
- Test first: two consecutive blocked ticks write one audit row and one notice; a 2-years-old
  blocked year is still attempted.

### H5. Every employee with a leader link is treated as a leader when files are assigned

- Where: `plugins/year_close/services/builder.py:94-98`. The comment says "leaders", but the test
  `profile.italian_tl_id or profile.albanian_tl_id` is true for anyone who HAS a leader, i.e. every
  employee. `:122-123` then adds a pair (employee, own team), and `_pair_members` (`:171`) puts the
  employee into their own pair. `bundles_for_year` (`:261-265`) gives a user's leave and payslips to
  the first pair by sorted `(leader_id, team_id)`.
- Proven: employee id 4, their Line Manager id 5: pairs `[(1,2),(2,2),(4,3),(5,3)]`; the employee's
  leave goes to `aa_early_employee__T2.zip`, a bundle named after the employee, not to the leader's.
  Present since the first commit (`b2d4d42f`).
- Would break if: an employee's user id is lower than their leader's (anyone hired before their
  leader was created or promoted). Their leave and payslips leave the leader's bundle; extra bundles
  named after employees appear. Overtime/standby are not affected (owner rule, `:196-243`).
- Fix: build `leader_ids` from people who are leaders, not people who have one: the single
  definition `apps.users.services.leader_ownership.leader_user_ids()` (already used at `:213`) plus
  the deactivated `team_leader` holders added at `:105`. Keep `managed_member_ids_bulk` parity test.
- Test first (`test_owner_rule_bundles.py`): employee created before their leader -> their leave is in
  `leader__TEAM.zip`, and no bundle is named after the employee.

## 4. MEDIUM

| Id | Finding | Evidence | Fix and first test |
|---|---|---|---|
| M1 | `close_year` on a not-yet-eligible year calls `select_for_update()` outside a transaction. On PostgreSQL this raises `TransactionManagementError` the second time (when a `blocked` row exists). Tests use `TestCase` (wrapped in a transaction) and SQLite ignores the lock, so CI never sees it | `closer.py:65-70` calls `_lock_snapshot` with no `atomic`; `closer.py:45-47` | Wrap the ineligible branch in `transaction.atomic()`. Test in the PostgreSQL lane with `TransactionTestCase`: run `manage.py close_year --year <last year>` twice in January |
| M2 | Standby rows of a closed year can be deleted in the Django admin, and a change can move a record OUT of a closed year: `save_model` checks only the new date; `delete_model`/`delete_queryset` check only finalized payroll. A `ValidationError` raised in `save_model` is a 500 page in Django admin, not a form error | `apps/standby/admin.py:36-55` | Check `closed_year_error` on the stored date (re-read from the DB) in `save_model`, `delete_model` and per row in `delete_queryset`; raise `PermissionDenied` (admin shows 403) or use `has_delete_permission`/`get_readonly_fields` for closed-year rows. Test with the admin client |
| M3 | Archive bundle file names can collide: `_safe_component` maps `@`, space, `+` and `/` to `_`. Two bundles with the same cleaned name share one `YearSnapshotFile` row (`get_or_create` on `relative_path`); the second is never built and the completeness check (computed on bundle dicts, not files) passes | `builder.py:39-44`, `:318-321`; `closer.py:130-145`. Proven: `a@b`, `a_b`, `a+b` all become `a_b` | Append ids: `{leader}__{team}__{leader_id}-{team_id}.zip`. Assert in `_build` that planned names are unique; fail the snapshot otherwise |
| M4 | Data can change between readiness/build and the freeze. Nothing locks overtime/standby writes of that year while bundles are built (minutes on a large year), and `builder_counts` reads live counts at the end, so the MANIFEST can disagree with the bundles | `closer.py:75-99, 199-204` | Before `_finalize` freezes: recompute `pending_counts(year)` and compare with the sum of bundle MANIFEST counts; mismatch -> `failed` (rebuild next tick). Cheaper than a lock. Test: patch the builder to insert a row mid-build; snapshot ends `failed` |
| M5 | The leave page CSV/JSON export (and its pending/approved counts) silently stops at 1000 requests: the query asks `page_size: 1000` and uses `data.results` only, ignoring `count`/`next`. Staff see company-wide requests over all years (`ignore_date_filter`), so this is reached after about one year of use | `frontend/src/hooks/useLeaveQueries.ts:41-43, 96`; `frontend/src/pages/leave_management/LeavePage.tsx:109-110, 125-127` | Do as overtime/standby do: a server CSV (`StreamingHttpResponse`, `csv_safe`, same scoping as the list) or an `onFetchAll` that follows `next`. Add the leave CSV to `apps/reports/test_export_integrity.py`. Vitest: a mocked 1500-row response exports 1500 rows. Browser click-through required (Frontend gate) |
| M6 | The analytics overview shows a fabricated standby figure: `standby_hours = standby_completed_count * 8` (a count times 8, not hours). The trend compares leave by `created_at` and all statuses with the current period's filters, so the arrow can point the wrong way | `plugins/analytics/viewsets.py:321`, `:222-237` | Read real standby hours from the snapshot (add the field if missing; check the snapshot model first) or drop the column. Build the previous period with the same `_compute_analytics_filters` shape shifted back. Add both to the export integrity test |
| M7 | The synchronous analytics export has no date-range cap (the 400-day cap applies only to background jobs). A grant holder or staff can request 2000-2100 as PDF and tie up a gunicorn worker until timeout | `plugins/analytics/viewsets.py:531-611` vs `:672-675` | Apply `MAX_EXPORT_RANGE_DAYS` in `download_report` (400 with the same message); tell the UI to use export jobs for longer ranges. Test: 401-day request -> 400 |
| M8 | Scorecard and engagement month windows are UTC, not Europe/Tirane. `submitted_at__gte=<date>` filters turn a date into UTC midnight (`TIME_ZONE='UTC'`), and `_local_date`/`_business_days_elapsed` use the UTC date. A request submitted 00:30 Tirane on the 1st counts in the previous month; the 2-business-day SLA can be off by one day. Visible in tests as `RuntimeWarning ... OvertimeLog.submitted_at received a naive datetime` | `plugins/tl_scorecard/services.py:48-66, 108-119, 160-202`; `plugins/engagement/services.py:320-394`; `config/settings.py:196` | Build aware bounds once (`datetime.combine(day, time.min, tzinfo=business_tz())`) in `_month_bounds`, use `timezone.localtime(value, business_tz())` in `_local_date`/elapsed. Frozen months must not change: apply forward only (document like item 62). Test: a 00:30-Tirane submission on 1 Dec lands in December. Engagement is the documented source of truth (`docs/engagement-metrics.md`): check its stated rule before changing it |
| M9 | Leave edit has no row lock and no person lock: `perform_update` reads `instance` without `select_for_update` and releases its balance by the stale status, and it never calls `lock_person`, so an edit can race an approve (counter drift) or a concurrent create (overlap). Overtime edit takes the row lock but not the person lock (overlap race on edit). Standby edit takes NEITHER and is not atomic: the 2026-11-16 L5 fix ("finalize cannot slip in between the check and the save") was applied to overtime only, so a payroll finalize can still slip between `_ensure_not_in_finalized_payroll` and the save. Same class as the fixed M6/L5, edit path only | `apps/leave_management/viewsets.py:385-430` (overlap at `:397` runs before any lock); `apps/overtime/viewsets.py:285-307`; `apps/standby/viewsets.py:219-240` | Inside one `atomic`: `lock_person(user)`, then `select_for_update` the request, then validate, release, save, reserve. PostgreSQL-only race test next to the existing M6 one |
| M10 | Holiday recount computes `new_days` outside the lock and writes it after the request may have changed dates | `apps/leave_management/services/holiday_recount.py:77-87` vs `:48-62` | Recompute `count_request_days` from the locked row inside `_apply`. Test: change dates between the scan and `_apply` (patch) and assert the stored count matches the new dates |

## 5. LOW and hygiene

| Id | Item | Evidence | Action |
|---|---|---|---|
| L1 | `reopen_year` command catches Django's `ValidationError`, but the service raises DRF's, so `--reason "  "` prints a traceback | `apps/users/management/commands/reopen_year.py:8, 33-36`; service `approval_periods.py:11, 132-133` | Catch `rest_framework.exceptions.ValidationError` |
| L2 | Archives "leaders" list calls `profile.is_team_leader` per user (up to 3 queries each), the pattern CLAUDE.md forbids in loops | `plugins/year_close/services/archive_view.py:99` | Use `leader_user_ids()` once |
| L3 | A purge preview (dry run) re-hashes every archive file synchronously in the request; a multi-GB year can hit the worker timeout | `retention.py:165-168` | Cache the verification per file for the request, or verify once in a "check" step and pass the result |
| L4 | `closer._build`: lines 141-144 are two branches doing the same thing (dead logic that hides intent: `--retry` never rebuilds ready files) | `closer.py:141-144` | Collapse to one `if file_row.status == 'ready': continue` with a comment, after C1 |
| L5 | Standby CSV "User" column is blank for users without first/last name (overtime CSV uses username) | `apps/standby/viewsets.py:419` | `get_full_name() or username` (keep frontend rowMapper parity; check `StandbyPage`) |
| L6 | `my_team_members` returns the database exception text to the client in a 500 | `apps/users/viewsets.py:1327, 1383` | Log it, return a generic message |
| L7 | Overtime retention purge at 3 years is always refused while finalized payroll (5 years) references the rows (`PROTECT`), but the Archives page shows overtime as removable | `retention.py:203-206`, item 57 | Show "kept until payroll is removed" when payroll rows reference the category; or set overtime/standby removal to the payroll date |
| L8 | Untracked scratch files, including `apps/standby/test_tmp_audit_repro.py` (ruff hit) and this round's empty probe | `git status` | Owner deletes them |

## 6. Checked and passed (do not redo)

- Closed-year lock on the REST path: create (serializer), update/partial_update/destroy/approve/reject
  (`core/mixins/permissions.py:316-372`), bulk approve/reject/delete (`:434-519`), both importers,
  the standby admin save (new date only, see M2). Overtime is not registered in Django admin.
- Archive downloads: superuser-only, plugin-enabled check, signed single-use token bound to user and
  file, user re-checked before the nonce is consumed, every download audited
  (`plugins/year_close/viewsets.py:66-163`).
- Payroll: cancel only on drafts, finalized runs immutable, draft inputs re-checked at finalize.
- Owner rule: reports filters, dashboard, engagement, scorecard and year-close overtime/standby rows
  use `owned_by_leader_q`/`owner_leader_id`. `my_team_members` totals are per-person, not
  leader-owned, which is correct.
- `UserViewSet.get_permissions` overrides per-action permission classes, but a guard test exists
  (`apps/users/tests_app/test_user_viewset_action_guard.py`).
- Overtime/standby server CSV exports are streamed, scoped through `filter_queryset(get_queryset())`
  and formula-safe.
- Not covered this round: frontend pages in a browser, e2e, the HR and admin export buttons one by
  one, PDF layout, analytics export-job contents, the onboarding plugin.

## 7. What will break later (suggestions, none is a defect today)

1. A **year-close dress rehearsal** test: build a full fake 2026 (Manager, Line Manager promoted
   mid-year, leader demoted, superuser with overtime, employee hired before their leader, 12 payroll
   runs), move the clock to 2 Feb 2027 and close it. Assert: ready, frozen, 12 payslips per person,
   every row in exactly one bundle, then reopen + re-close gives version 2. C1, H1-H5 would all have
   failed it. Add it to the "Standing simulation gates" in CLAUDE.md.
2. A **content check, not only a hash check**, before any destructive retention step: archive counts
   must equal database counts per category.
3. **One definition per concept, imported, never re-derived**: "who is a leader" (H5 re-derived it),
   "who is a payroll subject" (H2), "who needs a December snapshot" (H3). Each mismatch above is two
   modules answering the same question differently.
4. **A notification for every scheduler job that can block** (year close today; payroll lifecycle
   already has reminders). A job that blocks quietly is worse than one that fails loudly.
5. **Run the year-close and closed-year tests in the PostgreSQL CI lane with `TransactionTestCase`**:
   `TestCase` hides `select_for_update` misuse (M1).

## 8. Owner decisions, then order of work

Owner decisions (answered 2026-11-17, binding for the implementer):
- **D1 (H2) = WARNING ONLY.** Approved overtime/standby of people payroll never pays (Managers,
  superusers, no wage covering the month, inactive) does NOT block the close. The rows stay in the
  archive bundles as today. Readiness adds one warning naming the count and the reason per group
  (e.g. "3 approved entries of 2 people who are not payroll subjects: 1 Manager, 1 without a wage").
  Only rows of real payroll subjects that are missing from a finalized run still block.
- **D2 (M8) = EUROPE/TIRANE FROM THE NEXT UNFROZEN MONTH.** Scorecard and engagement month windows and
  the business-day SLA count use `business_tz()`. A month whose snapshot/metric is already final
  (`computed_at >= freeze_at(month)`) is never recomputed: the change is forward-only. Record the
  switch month in `docs/engagement-metrics.md` and `docs/hbpr-and-scorecard.md`, and add a
  workflow-invariants item. Test: a 00:30-Tirane submission on the 1st lands in that month; a frozen
  month's stored numbers are unchanged after the switch.
- **D3 (C1) = COUNT CHECK + SUPERUSER SIGN-OFF.** A purge is refused when (a) the archive MANIFEST
  counts differ from the database counts for the category, or (b) the year was reopened after the
  ready snapshot was built and no superuser has confirmed the rebuilt set. Store the confirmation in
  the year's `RETENTION.json` ledger (`confirmed_snapshot: {version, by, at}`), written by a new
  superuser-only `POST archives/confirm-set/` (body: year, version) with an audit row; show a
  "Confirm rebuilt archive" action on the Archives page only when it is needed. Tests: purge refused
  with mismatched counts; refused after a reopen until confirmed; allowed after confirmation.
  The Archives page change needs the Frontend gate click-through.

Order (one branch and pull request per step, test first, targeted tests while iterating):
1. C1 + L4 (reopen supersedes, retention count check, D3 sign-off). Must land before any year is closed.
2. H1 (payslip names) and H5 (leader set). Small, no decision needed.
3. H2 (D1 = warning only), H3, then H4. Then the dress-rehearsal test (section 7 item 1). All before 1 Feb 2027.
4. M1, M2, M3, M4 (year-close hardening).
5. M5 (leave export, needs the Frontend gate click-through), M6, M7.
6. M9, M10, then M8 (D2 = Tirane, forward-only).
7. Section 5 when the file is next touched.

Gates for every pull request: `py -3.14 manage.py makemigrations --check`, `py -3.14 manage.py test`
(baseline 4927), `python -m ruff check` on changed files; the standing simulation gates in CLAUDE.md;
for M5 also `npx tsc --noEmit`, `npx vitest run`, `npm run build` and a browser click-through of the
leave export. Doc sync in the same pull request: `docs/workflow-invariants.md` items 31-33, 77
(year close and retention), 87 (exports), CLAUDE.md Hot Invariants (Closed year, Year close engine,
Archives) and the router row for year close, `docs/deploy/production-runbook.md` year-start and
year-close checklists.

## 9. Notes for the implementer

- Run trace `get_change_impact` before editing `bundles_for_year`, `candidate_pairs`,
  `check_year_readiness`, `partition_payable_users` and `freeze_scorecard_months`. Quote the line you
  change. Never weaken a test; rewrite `test_payslip_files_are_named_by_username` to the new format.
- `plugins/year_close/test_year_close.py` `YearCloseFixture` is the right base for new tests: it sets
  `SNAPSHOT_ROOT` to a temp dir and clears the closed-year cache.
- Plugin removal safety: `apps/users` must not import `plugins.year_close` (C1 fix goes through a
  signal or lives in the plugin). Readiness/builder imports of payroll and tl_scorecard stay
  `ImportError`-only (`GuardTests` enforces it).
- The probe reproductions above take under a second each; rebuild them from the "Proven" lines as
  the red tests.
