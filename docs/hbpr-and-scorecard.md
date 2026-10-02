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
| Scope | **Stored, not computed.** `HbprAlbanianTlAssignment` (`apps/users/models/hbpr.py`): one open row per AL TL (partial-unique on `effective_to IS NULL`), dated history kept, PROTECT FKs so assignments are never deleted. `hbpr_scope.py` returns the assigned AL TLs plus their `get_team_member_ids()` union (active only, viewer excluded); an unassigned HBPR gets an empty scope, not `None`. |
| Writes | All through `apps/users/services/hbpr_assignments.py` (overlap rejected under `select_for_update`; `reassign` is end+create atomically). Admin API `/api/users/hbpr-assignments/` is staff-only: `end` and `reassign` actions, no delete, identity/range immutable via PATCH. |
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
  notification deep links), status and period. Desktop table, mobile cards.
- `/tl-scorecard` is the AL-TL authoring workspace (`components/scorecard/*`); an
  HBPR-only viewer is redirected to `/hbpr` before any query fires. The AL TL's "HBPR
  partnership" section reads `GET /api/plugins/tl_scorecard/partnership/`.
- `/admin/hbpr-assignments` (`SuperuserRoute`): create and end assignments.
- `HbprRestrictedRoute` guards Calendar and Leave; `isHBPROnly` is computed once in
  `computePermissions.ts`. Settings shows an "HBPR Governance" group with in-app and
  push switches per group.

## Operations

**Deploy:** `docker/entrypoint.sh` runs `migrate`, `sync_plugins`, then
`grant_hbpr_plugin_access` (a reconciler: grants `hbpr` view on `tl_scorecard`, removes
it from `engagement`; runs on every start). Plugin permission manifests (including
`denied_roles`) are reconciled when a plugin is enabled/synced. Migrations in this
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

## For AI agents

1. Load this file (router row: scorecard/HBPR/EPR/PIP/cadence) before coding.
2. TDD; never claim a phase done without the test names and counts.
3. Test on py3.14 (production Django), not just the default interpreter.
4. `.devin/` is gitignored — durable knowledge goes in this file or `CLAUDE.md`, not only there.
5. Do not write real credentials into source, tests, plans or logs.
