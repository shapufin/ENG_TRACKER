# Plan: Client archive lifecycle and onboarding export

**Date**: 2026-10-26 · **Status**: PLANNED · **Spec**: `docs/superpowers/specs/2026-10-26-client-archive-design.md`
**Order**: A1-A3 can start now; A4 needs foundation phase Y1 of `2026-10-26-year-close-snapshot.md`. Branch per phase (new branch off main).
**Progress**: A1 implemented on branch `feat/client-delete-guards` (uncommitted, 2026-10-26); A2-A6 pending.
**Primary goal**: An admin can retire a client without ever losing overtime, payroll evidence or onboarding files, and a superuser can export and clean up onboarding data safely.

## Phase 0: Discovery (done 2026-10-26)
*Serves the goal: fixes the facts below so no phase invents an API.* Allowed, verified: `Client` `apps/overtime/models/core.py:37`; hard delete `apps/overtime/viewsets.py:84`; `ProtectedRecordConflict` `apps/users/viewsets.py:68-77`; plugin gates `core/mixins/permissions.py:935-1032`; onboarding `plugins/onboarding/{models,viewsets,plugin}.py`; restore delete `plugins/site_backup/services/restore.py:186`; audit `plugins/audit_log/signals.py:7` (`log_action`); clock `core/utils/timezone_local.py:56`. Anti-patterns: `date.today()`, bare `except Exception` around optional plugins, `is_deleted` for archive, any import of a plugin from core outside the allow-list.

## A1 Guards (no UI change)
*Serves: nothing can destroy records through a client delete.* Do: `OvertimeLog.client` to PROTECT + migration `0011` (run `sqlmigrate`, expect no SQL); `pre_delete(Client)` guard for standby and ticket-KPI links; destroy returns 409 with counts; `Document` `post_delete` file cleanup via `on_commit`; `restore.commit` turns `ProtectedError` into `RestoreError`. Copy: `ProtectedRecordConflict`. Verify: new tests fail first; `py -3.14 manage.py test apps.overtime plugins.onboarding plugins.site_backup`; `makemigrations --check`. Guard: do not override `Client.delete` only (queryset delete bypasses it).

## A2 Inactive-client validation
*Serves: archived clients cannot receive new records.* Do: `apps/overtime/services/client_lifecycle.ensure_client_active` and call it from the 9 write paths in spec section 3 (new links only on update); Client importer drops `is_active`; log importers add a row error. Verify: one test per path plus "unchanged edit still saves". Guard: no 400 on editing an old record of an archived client.

## A3 Lifecycle service and endpoints
*Serves: archive, purge and delete behave exactly as agreed.* Do: `archive/unarchive/lifecycle/purge_onboarding/destroy` with explicit superuser gates; archive unassigns users only; audit each; cache invalidation; onboarding hook for counts/purge; `?archived=true` list and non-superuser exclusion in Folder/Document querysets; archived is read-only. Add routes to `apps/permissions/test_row_ownership_matrix.py` and plugin-view-guard. Verify: tests for gates (activity window with `freeze_business_today`, typed code, export freshness stub), permissions per role, staff blocked from archived onboarding. Guard: ticket_kpi links untouched on archive.

## A4 Export (after Y1)
*Serves: onboarding data can be exported before any purge or delete.* Do: `export` plugin action (+ seed check), `ClientExport` model, job `process_client_exports`, signed single-use download via foundation helpers, zip layout and manifest per spec; per-client for assigned users, all-clients for superuser. Copy: `plugins/site_backup/services/backup.py:127-186` (zip, sha256, audit). Verify: layout/sanitising/duplicate/missing-file tests; scoping tests; `EXPORT_JOBS_INLINE` path; 5 GB sanity run with a generated tree (memory flat). Guard: no blob download, no `FileResponse` of big files in production, no export rows in Site Backup (`EXCLUDED_MODELS`).

## A5 Frontend
*Serves: the admin sees archive instead of delete and cannot skip the export.* Do: ClientsPage archive/unarchive/purge/delete dialogs from `lifecycle/`; picker `is_active` filter; edit-dialog injection of the record's client; onboarding Download ZIP, Archived toggle, Export all; invalidations. Copy: `ClientsPage.tsx`, `BackupRestorePage.tsx`. Verify: `npx vitest run src/<paths>`, `npx tsc --noEmit`, `node scripts/modal-audit.mjs`, control and surface audits `--strict`; render gates marked UNMEASURED if no browser. Guard: no `prompt/confirm/alert`, no raw colours, labels on every control.

## A6 Docs and tracking
*Serves: the next session cannot re-introduce hard delete.* Do: `workflow-invariants.md` item 29; `CLAUDE.md` router row and the "Client model & assignment" and "Site backup/restore" bullets; `.devin/context` onboarding notes and `PROJECT_INDEX.md`; `AGENTS.md` entry; mark this plan IMPLEMENTED with branch names. Verify: grep shows no doc still saying clients can be deleted.

## Final verification (once)
`py -3.14 manage.py check`, `makemigrations --check`, full backend test run, `ruff` on changed files, frontend `tsc`, full `vitest`, `npm run build`; grep guards: no `Client.objects...delete()`, no `date.today` in new code.
