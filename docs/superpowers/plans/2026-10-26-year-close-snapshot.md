# Plan: Foundation, year close and Previous Years

**Date**: 2026-10-26 · **Status**: PLANNED · **Spec**: `docs/superpowers/specs/2026-10-26-year-close-snapshot-design.md`
**Order**: Y1 first (client plan phase A4 needs it), then Y2, Y3, Y4, Y5. Branch per phase.
**Primary goal**: Every year closes by itself into a frozen, downloadable evidence set, and the closed year can no longer be edited, with no manual cron work.

## Phase 0: Discovery (done 2026-10-26)
*Serves the goal: fixes the facts below.* Allowed, verified: `export_ot_standby_to_excel` `apps/reports/services/export_service.py:234`; `generate_payroll_excel/pdf`, `generate_payslip_pdf` `plugins/payroll/services/export_service.py:245,905,929`; `leader_team_pairs` `plugins/engagement/services.py:233`; carry-over pattern `apps/leave_management/services/carry_over.py:88`; `finalize_period` `apps/users/services/approval_periods.py:74`; compose loop `docker-compose.yml:228-280`; entrypoint `docker/entrypoint.sh:101`; admin page pattern `BackupRestorePage.tsx`, `BackupSidebarItem.tsx`, `plugins/index.ts:199`. Anti-patterns: gunicorn streaming of big files, `MEDIA_ROOT` for snapshots, plugin import from core, `date.today`, deleting live rows.

## Y1 Foundation
*Serves: jobs run unattended and big files download safely.* Do: `BasePlugin.get_scheduled_jobs`; `run_scheduler` command (heartbeat, SIGTERM, per-job error isolation); compose `scheduler` service (copy backend env block, `RUN_MIGRATIONS=0`, heartbeat healthcheck); volumes `export_files`, `snapshot_files` (+ `db-backup` tar of snapshots); `EXPORT_ROOT/SNAPSHOT_ROOT`; `core/utils/protected_download.py` (signed single-use token + X-Accel); nginx `internal` locations; `.env.example`. Verify: `ComposeContractTests`, `EntrypointContractTests`, nginx contract tests updated and green; scheduler unit tests (due job, exception, disabled plugin); manual `docker compose config` check. Guard: Dockerfile image `HEALTHCHECK` overridden for the scheduler; no new Celery dependency.

## Y2 Closed-year lock
*Serves: a closed year stays frozen.* Do: `ClosedYear` model + migration in `apps/users`; `is_year_closed/assert_year_open`; enforce in `MonthlyLockMixin`, overtime/standby serializers, bulk actions, importers, `StandbyLogAdmin`; `PayrollRunAdmin` readonly when finalized; `reopen_year` command (audited). Verify: lock tests for user, TL, staff, superuser, importer; leave unaffected test. Guard: do not touch leave closed-year behaviour; use `business_today`.

## Y3 Year close engine
*Serves: the evidence set is complete, verifiable and built once.* Do: plugin `year_close` (`plugin.py`, models `YearSnapshot/YearSnapshotFile`, `check_year_readiness`, `close_year` + `--retry`, `safe_sheet_title`, builders reusing the existing exports, manifest + sha256, scheduler job, audit); Site Backup `EXCLUDED_APPS`. Copy: carry-over idempotency, `finalize_period`, `create_site_backup` zip. Verify: readiness matrix, concurrency, retry, completeness, cross-year leave, hashes; query-budget test for the pair loop; `apps/plugins` isolation and view-guard tests. Guard: names stored as text; pairs from `leader_team_pairs` only; never write `ClosedYear` before all files are ready.

## Y4 Previous Years page and payroll default year
*Serves: the superuser can download the set and payroll lists stay clean.* Do: viewset (list, files, download-link, download; superuser-only plus `PluginEnabledMixin`, `permission_action_map`); page, route, slot, crumb, `pluginName`; `business_year`/`years` on `runs/scope/` and the year select; update the three pinned payroll tests. Verify: vitest for page and payroll, `admin-routes.test.mjs`, sidebar/breadcrumb tests, all four audits. Guard: page checks `isSuperuser` itself (`SuperuserRoute` admits staff); no delete button; browser year is never the default.

## Y5 Docs and tracking
*Serves: nothing says "no scheduler" or "closed year is editable" any more.* Do: `workflow-invariants.md` items 30-31 and the item 17 rewrite; runbook 1, 3, 4, 5.1, 5.4, 5.6 (add `cleanup_export_jobs` row); `server-migration-checklist.md`; `README.md` backups; `CLAUDE.md` router + bullets; `.devin/context` (`07-backup-restore.md`, `PROJECT_INDEX.md`, new `PLUGINS/10-year-close.md`); launch-review SR-01 note; `AGENTS.md`; mark both plans IMPLEMENTED. Verify: grep for the stale phrases.

## Final verification (once)
Same gates as the client plan, plus `docker compose config`, a dry-run `close_year --year <test year>` on seeded data, and a restore drill of the snapshot volume from a `db-backup` archive.
