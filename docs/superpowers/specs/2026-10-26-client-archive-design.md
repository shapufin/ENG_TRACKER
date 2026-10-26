# Client Archive Lifecycle and Onboarding Export (Design)

**Date**: 2026-10-26 · **Status**: DESIGN, awaiting review · **Part 1 of 2** (Part 2: `2026-10-26-year-close-snapshot-design.md`)
**Plan**: `docs/superpowers/plans/2026-10-26-client-archive.md`

## Intent

A client is never casually deleted. Today `ClientViewSet.perform_destroy` hard-deletes: the cascade removes the client's
`OvertimeLog` rows (even ones paid in finalized payroll), its onboarding folders and documents (files stay orphaned on disk),
and silently drops standby, KPI and user links. This design replaces delete with **archive**, keeps every record intact, keeps
onboarding data until a superuser exports and purges it, and allows a hard delete only for a client that was never used.

Success: no code path (API, importer, Django shell, site-backup restore) can destroy overtime, standby, payroll-referenced or
onboarding data by deleting a client; archived clients vanish from every normal user view; history still shows their name; a
superuser can read archived onboarding and export it as a ZIP.

## Decisions (made with the owner, 2026-10-26)

| # | Decision |
|---|---|
| D1 | **Archive = `is_active=False`** through a dedicated superuser action. `is_active` becomes read-only in the generic update, and the Client importer stops writing it. `is_deleted` stays unused (site-backup round-trip tests pin it). |
| D2 | Archive **unassigns the client from all users** (`UserProfile.clients`). It does **not** touch ticket_kpi links (see G3). Unarchive does not restore assignments. |
| D3 | Records keep pointing at the archived client (FK intact, names still render). New records for an archived client are rejected. |
| D4 | **Hard delete**: superuser-only, only when the client is archived and has **zero** overtime, standby and ticket-KPI links. Onboarding data must be exported first (D7). |
| D5 | **Purge onboarding**: superuser-only, only for an archived client with **no overtime/standby activity in the last 12 months** (business clock). Removes folders, documents and files; the client row and all records stay. |
| D6 | Archived clients' onboarding is **readable by superusers only, read-only**. Staff and users never see it. |
| D7 | **Export first**: delete and purge require a completed, current per-client export (<24h old, document count equals the live count) plus the typed client code. |
| D8 | ZIP export: per client (users with the `export` grant, own assigned clients; superusers any, including archived) and all clients (superuser). Built as a **background job**, delivered through a **signed single-use URL served by nginx** (foundation, section 6). |

## Gaps this design closes (from the 2026-10-26 research)

- **G1 Cascade destroys overtime.** `OvertimeLog.client` becomes `PROTECT` (migration, state-only; verify with `sqlmigrate`).
- **G2 Standby/KPI/user links cannot be PROTECTed** (auto M2M through tables). A `pre_delete` guard on `Client` raises `ProtectedError`
  for standby and ticket-KPI links, so queryset deletes, the shell and the Django admin are covered. User links are cleared by archive and may vanish on delete.
- **G3 Export profiles fail open.** `ExportProfile.assigned_clients` empty means "unrestricted". Archive therefore leaves ticket_kpi links alone, and delete is blocked while any exist.
- **G4 `ProtectedError` returns 500 today.** Destroy catches it and returns 409 with counts (copy `ProtectedRecordConflict`, `apps/users/viewsets.py:68-77`).
- **G5 Inactive clients are accepted on every write path except self/TL assignment**: overtime create/update, standby, KPI upload/evidence/export profile, both log importers, `UserProfileSerializer.clients`.
  One validator, `ensure_client_active`, rejects on create and, on update, only when the client set *changes* (so editing an old record is not rejected).
- **G6 Orphaned files.** A `post_delete` on `Document` removes the file in `transaction.on_commit` (also fixes ordinary document deletes).
- **G7 Site-backup restore** with `delete_missing_models` would raise `ProtectedError` mid-transaction. `restore.commit` converts it to a clean `RestoreError`.
- **G8 UI blanks.** Old overtime/standby edit forms render the archived client blank for non-staff; they must inject the record's own client as a fixed option and preserve it on save. Staff pickers must filter `is_active`.
- **G9 Stale token.** `client_ids` is baked into the JWT; the backend is authoritative (onboarding already filters active and assigned), the UI link may linger until refresh. Accepted, documented.
- **G10 No audit trail** for client changes. Archive, unarchive, purge, delete and export log through `audit_log` (ImportError-only guard, action `export`/`other`).
- **G11 Importer reactivation.** The Client importer cannot flip `is_active`; the log importers reject archived clients per row.

## Design

### 1. Backend: apps/overtime (Client)
- `ClientViewSet`: `get_permissions` gains explicit superuser gates for `archive`, `unarchive`, `destroy`, `purge_onboarding`, `lifecycle` (a new action defaults to `IsAuthenticated` otherwise).
  Archive runs in one transaction: set `is_active=False`, clear `assigned_users`, audit, `invalidate_related_cache()`.
- `GET clients/{id}/lifecycle/` (superuser): `{is_active, assigned_users, counts:{overtime, standby, ticket_batches, evidence, export_profiles}, last_activity, onboarding:{folders, documents, bytes}, can_delete, can_purge, blockers[]}`. The UI renders dialogs from it; the same service function enforces the rules server-side.
- `apps/overtime/services/client_lifecycle.py`: `ensure_client_active`, `client_blockers`, `last_activity` (uses `business_today`, never `date.today`), `archive`, `unarchive`, `purge_onboarding`, `delete_client`. Core never imports the onboarding plugin: onboarding counts and purge are reached through a registered hook (`ImportError`-only), same pattern as `apps/plugins/test_core_plugin_isolation.py` allow-list.
- Migration `apps/overtime/migrations/0011_*`: `OvertimeLog.client` to `PROTECT`.
- `pre_delete(Client)` guard in `apps/overtime/signals.py` (connected in `AppConfig.ready`).

### 2. Backend: plugins/onboarding
- `OnboardingClientViewSet.list`: `?archived=true` returns archived clients, superuser only; default unchanged (active, assigned).
- `Folder`/`Document` viewsets: non-superusers never reach rows of an inactive client (queryset filter `client__is_active=True`); writes to an inactive client are rejected for everyone.
- New plugin action **`export`** (`get_permission_actions`, manifest `public: True` like `view`, `permission_action_map`). Confirm `seed_plugin_permissions` (runs at boot) seeds it; add a data migration only if it does not.
- `ClientExport` model: `client` (nullable FK `SET_NULL` plus `client_code`, `client_name` text copies), `kind` (client|all), `requested_by`, `status` (pending|running|ready|failed|expired), `folders`, `documents`, `bytes`, `sha256`, `relative_path`, `error`, `created_at`, `completed_at`, `expires_at`, `download_nonce`. Table `onboarding_clientexport`.
- Endpoints (all `PluginPermissionMixin`, throttle scope `export`): `POST clients/{id}/exports/` (create job), `GET exports/{id}/` (status), `POST exports/{id}/download-link/` (mint signed URL), `GET exports/{id}/download/?token=` (X-Accel). `POST exports/all/` is superuser only.
- Job `process_client_exports` (registered with the scheduler, foundation section 5): builds `ZIP_STORED` zip with `zipfile` to a temp `.part` on the export volume, renames on success, writes `MANIFEST.txt` (counts, missing files, sha256 list). Layout `CODE - Name/Folder/Sub/Document`. Names are sanitised (reserved characters, trailing dots, 120 chars) and de-duplicated (` (2)`). A missing file on disk is listed in the manifest, not fatal.
- `purge_onboarding(client)`: deletes documents then folders, files removed on commit, audit entry.
- `post_delete(Document)` file cleanup.

### 3. Other write paths (G5)
`ensure_client_active` is called from: `OvertimeLogCreateSerializer`/`OvertimeLogSerializer`, standby serializers (new ids only), ticket_kpi upload commit, evidence and export-profile serializers (new links only), `overtime_logs`/`standby_logs` importers (row error "client X is archived"), `UserProfileSerializer.clients` (new ids only).
The Client importer drops `is_active` from its bool fields.

### 4. Frontend
- `ClientsPage`: "Delete" becomes **Archive / Unarchive** (ConfirmDialog states the consequences: N users unassigned, hidden from pickers, records kept). Status filter (Active/Archived). Archived rows show **Export ZIP**, **Purge onboarding** and, when `can_delete`, **Delete** (superuser only). The dialogs fetch `lifecycle/`, force the export step, require the typed code. Reuse `ConfirmDialog` and the Dialog contract; no `prompt/confirm`.
- Pickers (overtime, standby, KPI) request `?is_active=true`; the admin clients page keeps the full list. Edit dialogs inject the record's own client (G8).
- Onboarding page: per-client **Download ZIP** button for users with `export`; superuser gets an **Archived** toggle (read-only banner) and **Export all clients**. Downloads use the signed-URL anchor, never a blob.
- Invalidate `["overtime","clients"]`, `["overtime","available-clients"]`, `["team","members"]`, `["onboarding","clients"]` after lifecycle actions.

### 5. Errors
409 with counts for `ProtectedError`; 400 with the blocker text for failed purge/delete gates (named reason, e.g. "14 overtime records"); 403 for non-superusers; export failure keeps the partial file out of the volume and records `error`.

### 6. Out of scope here
Foundation (scheduler service, volumes, signed download, nginx) is specified in the Part 2 spec and built first (plan phase P1).

## Testing (TDD)
`PROTECT` blocks delete with logs; `pre_delete` blocks queryset delete with standby/KPI links; archive unassigns users and keeps records and names; archived client rejected on every write path (create) and tolerated on unchanged update; lifecycle gates (activity window, export freshness, document count drift, typed code); export scoping (own clients only, archived superuser-only, staff blocked); zip layout, sanitising, duplicate names, missing-file manifest; file cleanup on document and folder delete; restore converts `ProtectedError`; importer cannot reactivate; row-ownership matrix and plugin-view-guard entries; frontend: dialogs, picker filtering, edit-dialog injection, query invalidation, audits (modal, control, surface).

## Docs and tracking (must land with the code)
`docs/workflow-invariants.md` item 29; `CLAUDE.md` router row and the "Client model & assignment" and "Site backup/restore" bullets; `.devin/context/PLUGINS/` onboarding notes; `PROJECT_INDEX.md`; `docs/reviews` follow-up note; `AGENTS.md` entry. Details in the plan, phase P5.
