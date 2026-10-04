# HBPR ↔ Albanian-TL governance and TL Scorecard

Current design as of 2026-10-02 (all ten phases of the HBPR megaplan landed). This
file is **git-tracked** and is the durable source of truth for operators and for every
AI/agent working here; `.devin/context/PLUGINS/08-hbpr-scorecard.md` is a local,
gitignored mirror with more detail. The one-paragraph rule summary lives in `CLAUDE.md`
(HBPR hot invariant). Read this before touching anything HBPR, scorecard, evidence,
cadence, or the governance notifications.

## What HBPR is

`hbpr` is the role of the HR Business Partner for Italy. It is a **read-only governance
observer** of the Albanian team leaders (AL TLs) an admin explicitly assigns to them. It
is not a team leader and not HR, and has no overtime, standby, payroll or reports.

| Area | Behaviour |
|---|---|
| Scope | **Stored, not computed.** `HbprAlbanianTlAssignment` (`apps/users/models/hbpr.py`): one open row per AL TL (partial-unique on `effective_to IS NULL`), dated history kept; evidence holds a PROTECT FK, so evidence-bearing rows are never deleted — evidence-free ended rows older than 6 months are purged by `purge_ended_assignments` (no scheduler: the staff-only admin list sweeps on read, `purge_hbpr_archive` runs in the entrypoint reconcile chain). `hbpr_scope.py` returns the assigned AL TLs plus their `get_team_member_ids()` union (active only, viewer excluded); an unassigned HBPR gets an empty scope, not `None`. |
| Writes | All through `apps/users/services/hbpr_assignments.py` (overlap rejected under `select_for_update`; `reassign` is end+create atomically). Admin API `/api/users/hbpr-assignments/` is staff-only: `end` and `reassign` actions, no delete (the retention purge is a service, not an API action), identity/range immutable via PATCH. |
| Reads | AL-TL governance records via `HbprReadScopeMixin`: **safe methods only**, owner AL TL in scope **and** subject in scope. HBPR never approves a PIP, decides a promotion or writes attendee notes (HR/staff do). Private TL `notes` stay redacted. |
| Employee one-on-ones | Never reachable through **any** door: the meeting list/detail, `MeetingAttendeeViewSet` (`hbpr_exclude` on `meeting__meeting_type`), the scorecard aggregate (`_mask_one_on_one` nulls `one_on_one_compliance_pct` for anyone who is neither the leader nor staff), exports, and notifications. A guessed id must 404. |
| Denied surfaces | For an HBPR-**only** user: Calendar, Leave, Organigrama, Skills, Ticket KPI, Engagement, My Records, overtime, standby, reports. Plugins use manifest `denied_roles`/`denial_override_roles` on `PluginPermission` (denial beats `is_public`; overrides list only elevated roles, never `employee`); static views use `HbprBlockedMixin`. Multi-role HBPR+HR/TL/CR-admin keeps the other role's access (`is_hbpr_only`, mirrored by the frontend `isHBPROnly`). |
| Roles | `hbpr` is a managed role: every `roles` list sent to the admin user APIs must include it or it is revoked. Revoking `hbpr`/`albanian_tl` while an open assignment exists is a structured 400. |

## Governance evidence and cadence

`HbprGovernanceEvidence` (`plugins/tl_scorecard/models.py`): `cadence_meeting`
(repeatable, `reporting_year` NULL) and `epr_mid_year`/`epr_year_end` (year required,
unique per assignment/kind/year). Authored by the **assigned AL TL only**; read and
exported by the assigned HBPR and staff. **Staff are read-only auditors.** No destroy:
corrections are audited updates (`updated_by`). An HBPR sees/exports only evidence of
assignments **they** own (a successor never receives a predecessor's evidence). API:
`/api/plugins/tl_scorecard/hbpr-evidence/`.

Cadence (`weekly`/`biweekly`/`monthly`) is per assignment. `next_due_on`: +7d / +14d /
same day next month clamped to month end, from the last cadence meeting or the start.
`cadence_status` has exactly one definition
(`apps/users/services/hbpr_assignments.cadence_status`). Due/overdue is UI-only.

## Architecture guardrails (added by the 2026-10-02 hardening pass)

- **Fail-closed scoping.** HBPR-readable scorecard viewsets subclass
  `core.mixins.viewer_scope.HbprScopedQuerysetMixin` and DECLARE their policy
  (`hbpr_leader_field`/`hbpr_member_field`/`hbpr_member_nullable`/`hbpr_exclude`, or
  `hbpr_no_access = True`) plus `base_queryset()`/`own_q()`. A concrete class without a
  declaration raises `TypeError` at import, and `test_hbpr_invariants.py` fails if a
  hand-rolled `HbprReadScopeMixin` viewset reappears. The staff bypass lives in one place
  (`get_queryset`, `core.mixins.permissions.is_staff_user`).
- **Route-walking invariant.** `test_hbpr_invariants.py` plants a one-on-one, its
  attendee and private notes, then hits every registered route as an HBPR; a new door that
  leaks fails there without anyone writing a test for it.
- **Zero-query change tracking.** `core.models.abstract.TrackedFieldsMixin` snapshots
  `tracked_fields` in `from_db`/`save()`; signal handlers use `_changed()`. Never add a
  pre_save `SELECT`. Tracked models: Meeting, IdleFlag, Absence, PIPRecord, PromotionFlag,
  EPRCycle, HbprGovernanceEvidence, HbprAlbanianTlAssignment.
- **Boot reconciliation.** `docker/entrypoint.sh` runs `sync_plugins` ->
  `seed_plugin_permissions` -> `grant_hbpr_plugin_access` on every start;
  `apps/plugins/test_hbpr_boot_path.py` reads the entrypoint itself and asserts the end
  state (HBPR denied on Engagement/Organigrama/Skills/Ticket KPI, granted `tl_scorecard`).
  Owners: manifest sync = source of truth, the command = reconciler, `plugins.0010` =
  one-time backfill.
- **Module layout.** `plugins/tl_scorecard/viewsets/` is a package (`scorecard`, `records`,
  `decisions`, `epr`, `evidence`) that re-exports every name; import from `.viewsets`.
  Shared test helper: `plugins/tl_scorecard/testing.py` (`make_user`).

## Notifications

Registry types share one user-facing key via `preference_group` (resolved in
`__init_subclass__`; `REGISTRY` holds classes). Five HBPR groups, independent in-app and
push switches each: `hbpr_meetings`, `hbpr_epr`, `hbpr_pip_promotion`, `hbpr_team_risks`,
`hbpr_record_updates`. Triggers (all after commit; recipients = the owner AL TL's open
assignment, never a global fan-out; generic copy; one-on-ones never notify):

- meetings: cadence evidence recorded **or edited**; assignment created/ended;
- epr: EPR participation recorded/edited; a team member's EPR stage completed;
- pip/promotion: PIP awaiting approval, PIP closed, promotion nominated;
- team risks: idle/absence raised **or resolved/addressed**;
- record updates: review delivered; non-one-on-one meeting created/rescheduled.

"Edited" means a meaningful field changed (`signals._tracker`/`_changed`); an
`updated_by`-only re-save never notifies, and an edit's dedupe key carries `updated_at`.

## Frontend

- `/hbpr` workspace (`HbprWorkspacePage`, `app` layout) with URL-backed view, year,
  leader, kind (`pips|promotions|idle|absences|meetings|reviews` — shared with the
  notification deep links), status, period and page. Desktop table, mobile cards.
  Records and evidence are paged **server-side** (one kind / one page per request):
  `GET .../hbpr/records/?kind=&leader=&status=&period=&limit=&offset=` returns
  `{count, results}` and delegates to the resource viewsets, so scope and redaction are
  reused, never copied (`plugins/tl_scorecard/hbpr_records.py`); evidence uses the
  evidence viewset's DRF `page` plus `period_year` and `leader` filters. `kind` is
  required (the mixed "all types" view was dropped).
- `/tl-scorecard` is the AL-TL authoring workspace (`components/scorecard/*`); an
  HBPR-only viewer is redirected to `/hbpr` before any query fires. The AL TL's "HBPR
  partnership" section reads `GET /api/plugins/tl_scorecard/partnership/`.
- `/tl-scorecard?tab=records` — the TL's record table (`components/records/*`). Row
  click / Enter / the row's eye button opens `RecordDetailDialog` (`DialogContent
  size="lg"`): every serialized field of that record, full untruncated text, and a
  privacy chip per free-text block ("Private — only you and staff" vs "Shared with …").
  It also surfaces what the table never showed and **no extra request is needed** — the
  list serializers already embed it: `attendees` on meetings (name + Member/HRBP/Observer
  role; the API redacts each attendee's own `notes` unless the viewer is that attendee or
  staff) and `status_updates` on idle flags (the weekly log). Open idle flags the viewer
  manages offer **Log weekly update** → `LogIdleStatusUpdateDialog` →
  `POST .../idle-status-updates/` (one entry per flag per week, server-enforced; the 400
  is surfaced verbatim). Meeting attendees remain **read-only** here — there is no
  TL-scoped member picker, so the UI never offers creating one.
- `/admin/hbpr-assignments` (`SuperuserRoute`): create and end assignments.
  The table splits into **Active** (`is_current` — no end date or end date not
  yet passed, the same split as `?current=`/`unfinished_q`) and **Archive**
  (ended, read-only) tabs with counts; an Evidence column shows each row's
  `evidence_count`, which is also why an archived row can outlive the 6-month
  purge. The viewset annotates `last_meeting_on`/`evidence_count` from the
  plugin's `governance_evidence` table, guarded on `apps.is_installed` (a
  removed plugin leaves no reverse accessor; the serializer falls back to
  `None`/`0`).
- `HbprRestrictedRoute` guards Calendar and Leave; `isHBPROnly` is computed once in
  `computePermissions.ts`. Settings shows an "HBPR Governance" group with in-app and
  push switches per group.

## Operations

**Deploy:** `docker/entrypoint.sh` runs `migrate`, `sync_plugins`, then
`seed_plugin_permissions` (reconciles every manifest incl. `denied_roles`), then
`grant_hbpr_plugin_access` (a reconciler: grants `hbpr` view on `tl_scorecard`, removes
it from `engagement`), then `purge_hbpr_archive` (deletes ended, evidence-free
assignments older than 6 months); all run on every start. Migrations in this
release: `users` 0019, `plugins` 0009/0010, `permissions` 0007 (dependency pinned to
`plugins.0007_plugin_permission_system`), `tl_scorecard` 0004, `notifications` 0010.

**Assigning:** Admin → Users → HBPR switch, then Admin → HBPR assignments.

**Seed / e2e:** `e2e_hbpr` ↔ `e2e_tl_b` (`seed_e2e_data.py`).

## Verification

Run backend tests on **Python 3.14 / Django 6.1.1** (`py -3.14 manage.py test`): that is
the production stack (Dockerfile is py3.12 + Django 6.1.1). The default `python` is 3.11 +
Django 5.2 and hides Django-6 differences (e.g. `Signal.receivers` tuples are 4-wide).

```bash
py -3.14 manage.py check && py -3.14 manage.py makemigrations --check
python -m ruff check --output-format=concise apps core plugins
py -3.14 manage.py test plugins.tl_scorecard plugins.notifications plugins.engagement apps.users apps.plugins apps.leave_management apps.dashboard
cd frontend && npx tsc -b --noEmit && npx vitest run && npm run build && node scripts/modal-audit.mjs
# browser evidence (prepare_e2e_db BEFORE the servers; see .devin/context/12-VISUAL-VERIFICATION.md)
DJANGO_SETTINGS_MODULE=config.settings_e2e py -3.14 manage.py prepare_e2e_db
npx playwright test e2e/hbpr-governance.spec.ts --project=chromium
```

Known pre-existing baseline (not caused by this work): ESLint reports 2
`set-state-in-effect` errors in `AdminSidebar.tsx`/`Sidebar.tsx`; Prettier is unformatted
across ~535 files; `node --test scripts/visual-route-manifest.test.mjs` fails on routes
other workstreams added without manifest rows (`/hr/team-leaders`, `/hr/calendars`,
`/engagement/*`, `/onboarding`); `remove_plugin skills|organigrama --dry-run` lists
`data_import` importers that import those plugins.

## Review log

- **2026-10-02, phases 1–5 (backend):** attendee rows of a one-on-one leaked to an HBPR;
  scorecard exposed the one-on-one compliance %; an HBPR export included the
  predecessor's evidence; staff could author evidence; notifications fired only on
  creation. All fixed test-first (`HbprOneOnOneLeakTests`, `EvidenceStaffReadOnlyTests`,
  `EvidenceExportTenureTests`, `test_tl_scorecard_notifications_coverage.py`).
  Deliberate deviation: no `hbpr_policy.py` module (policy lives in each viewset's
  `hbpr_exclude` + serializer redaction; every new related viewset must repeat it).
- **2026-10-02, phases 6–10 (frontend/E2E/docs):** admin page uses native date inputs and
  local dates; notification preference saves merge only the saved row (no stale-response
  clobbering); E2E gained the one-on-one "every door" test and the staff-cannot-author
  test; the lifecycle test skips with a reseed instruction instead of corrupting the
  fixture. `Signal.receivers` unpack in `plugins/notifications/test_push.py` made
  Django 5/6 agnostic; OpenAPI type hints added to the assignment serializer.

- **2026-10-02, hardening pass (branch `refactor/hbpr-hardening`):** fail-closed
  declarative scoping + route-walking invariant test; `viewsets.py` (803 lines) split
  into a package; 35 duplicated staff-bypass checks -> 1; seven per-save `SELECT`
  trackers -> zero (`TrackedFieldsMixin`); server-side paged `hbpr/records/` and evidence
  (previously every page of 7 resources was fetched and filtered in the browser); HBPR
  revocation guard extracted from `update_user`; **entrypoint now reconciles plugin
  permissions** (a fresh/upgraded DB could previously keep HBPR un-denied on
  Skills/Ticket KPI until a plugin was enabled); `CLAUDE.md` HBPR/scorecard bullets
  trimmed (42 KB -> 34 KB); future-date validator uses the app calendar day
  (`timezone.localdate()`), not the host's.

- **2026-10-03, follow-up review (PRs #2–#6):** paged records now break date ties on pk
  and reject an out-of-range `?offset=` (400, not 500); the EPR-stage notification finds
  the covering HBPR through shared-team membership, not only the direct FK
  (`hbpr_user_ids_covering`); the Records tab counts an open absence in working days like
  the backend SLA; `services_hbpr` uses the app day helper.

- **2026-10-03, admin Users/HBPR UX (PRs #11–#13) + review follow-ups:** the Users page role
  tabs are now Employees (default) | Italian TL | Albanian TL | HBPR | HR | CR Admin (CR
  gated on the control_room plugin) — no All/No TL tab. `Employees` means "no elevated
  **role**" (no IT/AL TL, HR, HBPR or CR admin) and deliberately still lists Django
  staff/superusers and users who only lead a `Team` row: neither holds an elevated role and
  no other tab can classify them, so excluding them would make them unreachable
  (`viewsets._apply_role_filter`, pinned by
  `test_role_filter_employee_includes_team_leader_without_role`). The HBPR user form hides
  team/tech/TL controls and the TL/CR switches, warns which hidden roles will be revoked,
  and omits hidden assignment keys so stored values survive while the `roles` array drops
  incompatible roles (shared `buildRolePayload`); the bulk drawer mirrors this and gained a
  tri-state `is_hbpr` toggle. `bulk_update` accepts `is_hbpr` behind a batched
  `find_blocked_hbpr_revocations_bulk` pre-check inside the transaction. `/admin/hbpr-assignments`
  uses the shared `DataTable` (sort/search/pagination, effective from/to columns), and
  `DataTable.searchColumn` accepts a path array so a search matches either person. Follow-up
  fixes after review: the single-user HBPR refusal returns the canonical `blocked_revocations`
  key with dialog-shaped entries (`user_id`/`username`/`dependents: []`/`assignment_count`),
  so the edit form opens the same `TlRevokeBlockedDialog` as bulk; `update_user` translates
  `_sync_roles`' unseeded-role `ValueError` into a 400 like `create_user`; and
  `bulk_update`'s in-loop `TechAssignmentError` return calls `transaction.set_rollback(True)`
  so a mid-batch failure writes nothing (the old `return` committed earlier profiles' writes).

- **2026-10-04, HBPR dashboard 403s + assignment archive UX:** `useDashboardData`
  fired the two leave queries (`getRequests`, `getUserBalanceSummary`) gated only
  on `!!userId` while overtime/standby already used `selectedDashboard !==
  "hbpr"` — an HBPR-only viewer got console 403s from `HbprBlockedMixin` (the
  denial itself is correct). All self-service queries now share
  `canLoadSelfService`. `/admin/hbpr-assignments` gained Active/Archive tabs
  (split on `is_current` ≡ `unfinished_q`), an Evidence column, and a 6-month
  retention purge for ended **evidence-free** rows
  (`hbpr_assignments.purge_ended_assignments` + `purge_hbpr_archive` command in
  the entrypoint + lazy sweep in `HbprAssignmentViewSet.list`); the PROTECTed
  evidence FK is honoured by filtering, never weakened. Latent bug fixed
  alongside: the admin serializer's `last_meeting_on`/`evidence_count` were never
  annotated (Status showed "Not started" for every open row) — the viewset now
  annotates them, guarded on `plugins.tl_scorecard` being installed.

- **2026-10-04, TL records detail + note capture:** the TL Records tab was a flat table
  whose only preview was one truncated `focus` line, so the notes the models already
  store were effectively invisible. Added `RecordDetailDialog` (read-only, privacy
  chips per block), the idle-flag weekly log UI over the pre-existing
  `idle-status-updates/` endpoint (`LogIdleStatusUpdateDialog`, also reachable from the
  row menu), and closed the capture gaps that made some fields unreachable: review
  deliveries could not store `notes`/`reference_url` at all (the dialog never sent
  them), and meetings / idle flags / absences had no `reference_url` field while PIPs
  had no `shared_notes` field. TypeScript types gained the fields the API already
  returned (`attendees`, `status_updates`, `reference_url`, `recorded_at`,
  `shared_notes`) as **optional**, so existing test fixtures stay valid. Zero backend
  change — every field was already serialized and writable. Backend authorization,
  HBPR redaction and the `_OwnerOnlyNotesMixin` redaction are untouched.

**Assignment dates (2026-10-03).** `effective_to` is the **last day in effect**, not a
switch. An assignment covers a day `d` when `effective_from <= d` and (`effective_to` is
null or `>= d`) — one definition, `in_effect_q()` / `unfinished_q()` in
`apps/users/services/hbpr_assignments.py`, used by scope, notifications, role-revocation
and user-deletion guards, the admin `current` filter and `is_current`. So a future end date
keeps access until that day, and `reassign` with a future `effective_from` hands over
without a gap (old ends the day before). The DB unique constraint and `end`/`reassign`
targeting still key on `effective_to IS NULL` (one *unended* row per Albanian TL). Notifications
still fire when the end date is set, not on the day it passes (there is no scheduler).

**Accepted, not changed:** the assignment model and `/admin/hbpr-assignments` live in
core (`apps/users`) while evidence lives in the plugin (moving a deployed model is the
riskiest option for no user-visible gain); `UserViewSet.bulk_update` (complexity 37) and
`update_user` (25) remain large; repo-wide ESLint/Prettier baseline.

## For AI agents

1. Load this file (router row: scorecard/HBPR/EPR/PIP/cadence) before coding.
2. TDD; never claim a phase done without the test names and counts.
3. Test on py3.14 (production Django), not just the default interpreter.
4. `.devin/` is gitignored — durable knowledge goes in this file or `CLAUDE.md`, not only there.
5. Do not write real credentials into source, tests, plans or logs.
