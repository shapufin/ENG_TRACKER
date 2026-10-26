# Year Close, Frozen Snapshots and Platform Foundation (Design)

**Date**: 2026-10-26 · **Status**: DESIGN, awaiting review · **Part 2 of 2** (Part 1: `2026-10-26-client-archive-design.md`)
**Plan**: `docs/superpowers/plans/2026-10-26-year-close-snapshot.md`

## Intent

Each year gets a **frozen, readable snapshot** (never changes after it is built), a **write lock** on the closed year, and a
superuser-only **Previous Years** page to download it. Live rows are **not deleted**: default views show the current year, the
snapshot is the audit evidence. This part also builds the **foundation** both parts need: a scheduler service, durable and
transient file volumes, and large-file downloads that do not pass through gunicorn.

Success: on 1 February the previous year closes by itself (when ready), a superuser downloads one ZIP per IT TL and Team from
Previous Years, edits to a closed year are refused on every path, and nothing in the repo still claims "there is no scheduler".

## Decisions (owner, 2026-10-26)

| # | Decision |
|---|---|
| D1 | Eligible from **1 February** of Y+1 (not 10 January). Closes only when **ready**; otherwise the superuser sees blockers. |
| D2 | **Automatic under Docker Compose**: a `scheduler` service runs `manage.py run_scheduler`; no host cron needed. |
| D3 | **No deletion** of live rows in v1. "Download and Delete" becomes **Download**. Hidden from default views, not removed. |
| D4 | Previous Years page and snapshot downloads are **superuser-only**. HR/staff keep older payroll runs through the payroll year filter. |
| D5 | Payroll list **defaults to the current business year**; finalized runs of closed years are snapshotted as audit evidence. |
| D6 | Snapshot = one ZIP per **(IT TL, Team)** named `leader__team`, reusing the existing overtime/standby/leave/payroll exports. No new report formats. |

## Foundation

### F1 Scheduler
- `BasePlugin.get_scheduled_jobs()` (default `[]`) returns `(name, interval_seconds, dotted_callable)`. `core/management/commands/run_scheduler.py` is one long-lived process: loops every 5 s, runs due jobs of **enabled** plugins, catches and logs per-job errors, handles SIGTERM, touches a heartbeat file.
- Jobs: onboarding `process_client_exports` (10 s), `cleanup_expired_exports` (hourly), year_close `close_year` (hourly; the command is idempotent and cheap when nothing is due).
- `docker-compose.yml` `scheduler` service: same image as `backend`, **default profile** (required for exports), `command: python manage.py run_scheduler`, `RUN_MIGRATIONS=0`, the full backend env (copy the `:96-139` block, including the `:?` required vars), healthcheck = heartbeat age < 120 s (the image `HEALTHCHECK` curls :8000 and must be overridden), `restart: unless-stopped`, `no-new-privileges`, `backend_net`, depends on `db` healthy and `backend` started. Add a `ComposeContractTests` case.
- Existing boot commands stay; the runbook 5.4 table gains a "handled by the scheduler" column; host cron remains valid for one-offs (`manage.py close_year --year Y`).
- If the scheduler is down, jobs stay `pending`; the UI shows "queued longer than 2 minutes, check the scheduler".
- `EXPORT_JOBS_INLINE` (default on outside production settings) runs a job synchronously at creation for dev and tests.

### F2 Storage
- `EXPORT_ROOT` (transient, 24 h expiry, **not** backed up) and `SNAPSHOT_ROOT` (durable). Both outside `MEDIA_ROOT`, so Site Backup never zips them and `/media/` can never serve them (`config/views.py` default for unknown prefixes is staff-readable, a trap avoided by design).
- Volumes `export_files` and `snapshot_files`: rw for `backend` and `scheduler`; ro for `frontend` (X-Accel) ; `snapshot_files` also mounted ro in `db-backup` and archived by its loop (`snapshots_*.tar.gz`, same `.part` rename and retention). Uid 10001 ownership in the Dockerfile.
- Server move checklist and runbook section 3/4 updated; Site Backup carries a note that snapshots are backed up by `db-backup` only.

### F3 Large downloads
- gunicorn is 3 sync workers with `--timeout 120`; streaming a multi-GB file through it risks a worker kill and starves the pool; a blob download also holds the file in browser memory.
- Therefore: `POST .../download-link/` returns a signed token (`django.core.signing`, 120 s, bound to user and file, **single use** via a nonce consumed on the file row, because Redis may be off). The browser navigates to `.../download/?token=...`; the view validates, audits, then answers `X-Accel-Redirect: /_protected/<kind>/<file>`; nginx serves from the read-only volume. Dev falls back to `FileResponse`.
- `core/utils/protected_download.py` holds both helpers. nginx template gets `internal` locations `/_protected/exports/` and `/_protected/snapshots/` (aliases to the ro mounts, `add_header Content-Disposition` from the backend response is preserved). Update `config/test_deployment.py` contracts (global `client_max_body_size` rule is unaffected).

## Closed-year write lock (core)

- Core model `ClosedYear(year unique, closed_at, closed_by null, snapshot_ref text)` in `apps/users/models/core.py` next to `ApprovalPeriodClose`; helper `is_year_closed(year)` and `assert_year_open(date)` in `apps/users/services/approval_periods.py`, cached per process for 60 s.
- Enforced for overtime and standby (create, update, delete, approve, reject, bulk) for **everyone including staff and superuser**: `MonthlyLockMixin`, serializers, the data importers (`overtime_logs`, `standby_logs`), `StandbyLogAdmin`. Error text names the year and `reopen_year`.
- `PayrollRunAdmin.get_readonly_fields` locks `status/year/month/notes` of a finalized run.
- **Leave is deliberately excluded in v1**: cancellations legitimately flow back into closed balances (`restore_closed_year_days`). The snapshot records leave balances as of close time and says so in the manifest.
- `manage.py reopen_year --year Y --reason "..."` (shell/superuser only, audited) removes the marker and marks the snapshot `superseded`; a new close builds a new snapshot version.

## Year close

### Readiness (`check_year_readiness(year)` in the plugin; returns `blockers[]`, `warnings[]`)
Blockers: business date before 1 Feb of Y+1; any `draft` payroll run of Y; approved overtime/standby of Y without a finalized `PayrollRunEntry` (skipped when the Payroll plugin is disabled); any `pending` overtime/standby of Y; any `pending` leave overlapping Y; `ensure_year_end_rollover()` not yet applied for Y+1 (the close step calls it first).
Warnings: unfinished EPR final reviews (`EPRCycle`), approved rows whose settlement falls in Y+1, deactivated users with rows.

### Build (`close_year [--year] [--retry]`)
1. Default year = `business_today().year - 1`; older years only via `--year`. Row lock on `YearSnapshot(year)` (`select_for_update` plus unique constraint; copy `apply_year_end_carry_over` and `finalize_period`).
2. Not ready: store blockers on the row, status `blocked`, stop.
3. Pairs from `leader_team_pairs()` / `team_member_ids(leader, team)` (parity-tested with core), plus **deactivated leaders** and a synthetic **Unassigned** bundle for any user with rows in Y outside every pair. Completeness check: unique rows in all bundles must equal DB rows of Y, else the build fails.
4. Per pair a ZIP `{SNAPSHOT_ROOT}/{year}/{leader}__{team}.zip`: overtime+standby workbook (`export_ot_standby_to_excel(..., include_carryover=True)` with explicit querysets; `clear_cache()` per ZIP, new `ExportService()` is safer than the singleton), leave workbook (overlap filter, so 31 Dec to Jan leave appears), and payslip PDFs (`generate_payslip_pdf(line)`) for that pair's lines in finalized runs of Y, honouring the "parent scope is not child scope" payroll rule.
5. `company_{year}.zip`: per month `generate_payroll_excel(run)` and `generate_payroll_pdf(run)` for finalized runs, plus a year summary sheet.
6. Each ZIP contains `MANIFEST.json` (row counts, filters, generated_at, readiness warnings, per-file sha256); `{year}/MANIFEST.json` and `.sha256` cover the set. Sheet titles go through one `safe_sheet_title()` (illegal characters, 31-char collisions).
7. Per-file status (`pending|ready|failed`); a failed file never blocks the others; `--retry` rebuilds only failed files. Year becomes `ready` and the `ClosedYear` row is written **only when every file is ready**.
8. Audit entries for build, retry, reopen and every download (`action='export'`); `purge_audit_logs` retention can delete them, so the manifest is the durable record.

### Models (plugin `year_close`, tables `year_close_*`, names stored as text so users/teams can be deleted later)
`YearSnapshot(year, version, status blocked|building|ready|failed|superseded, readiness JSON, started_at, completed_at, total_bytes)`; `YearSnapshotFile(snapshot, kind team|company|unassigned|manifest, leader_name, team_name, relative_path, sha256, size, status, error, download_nonce)`. Added to Site Backup `EXCLUDED_APPS` (files are outside the backup, rows follow `db-backup`).

## Previous Years page (admin, superuser only)
Plugin route `/admin/previous-years` (layout admin, slot `admin-sidebar-nav-system`, entry in `ADMIN_PLUGIN_CRUMBS`, `pluginName` on the nav link). `PageShell` + `DataTable` of years (status, size, built at, blockers) with a files sub-table and per-file **Download**; blocked years list blockers. `SuperuserRoute` also admits staff, so the page checks `isSuperuser` itself (copy `BackupRestorePage.tsx:492-512`) and every endpoint uses a superuser-only mixin on top of `PluginEnabledMixin`. Follows the Dialog, control-kit, surface and table-header contracts. No delete button.

## Payroll default year (D5)
`runs/scope/` also returns `business_year` and `years`; `PayrollRunsPage` gets a year select defaulting to `business_year` (not the browser clock), passed as `getRuns({ year })`. The server list and its tests stay unchanged. Pinned tests to update: `payrollService.test.ts:49-52`, `PayrollRunsPage.test.tsx` stat cards, `PayrollRunsPage.scroll.test.tsx`. Fixes the latent first-50-runs truncation.

## Not now
Deleting live rows of a closed year (needs a retention rule first); onboarding inside snapshots (living per-client files, see Part 1); EPR/HBPR year-end pack inside the ZIP; leave write lock; defaulting every other list to the current year (inventory first); user-facing hiding of last year beyond the existing year filters.

## Testing (TDD)
Readiness matrix (each blocker alone, none, payroll plugin disabled); idempotent close (two concurrent runs, rerun after success, retry after one failed file); completeness check with unassigned/deactivated users and cross-year leave; sheet-title collisions; manifest hashes verify; `ClosedYear` lock on API, importers, admin for staff and superuser, leave unaffected; reopen; scheduler runs due jobs, survives a job exception, skips disabled plugins, heartbeat; compose and nginx contract tests; signed link expiry, wrong user, single use; superuser-only endpoints and page; `core/test_business_today_guard.py` stays green (use `business_today`, test with `freeze_business_today`); query budgets for the per-pair loop.

## Docs and tracking (must land with the code)
`workflow-invariants.md` items 30 and 31 and item 17 rewrite; runbook 1 (env table), 3, 4, 5.1, 5.4, 5.6; `server-migration-checklist.md`; `README.md` backups section; `CLAUDE.md` router + hot invariants (new bullets, Site backup bullet); `.env.example`; `.devin/context` (`PROJECT_INDEX.md`, `07-backup-restore.md` incl. `EXCLUDED_MODELS`, new `PLUGINS/10-year-close.md`); `docs/reviews/2026-10-20-launch-review.md` SR-01 note; `AGENTS.md`.
