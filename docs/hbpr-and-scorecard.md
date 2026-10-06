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

**Year-end evidence pack** — `GET .../hbpr-evidence/year-end-pack/?assignment=&year=`
returns the packaged summary the AL TL hands to their manager at year-end review:
cadence meetings held vs **expected** (computed from the assignment's active window
inside the year — `max(effective_from, Jan 1)` → `min(effective_to, Dec 31, today)`;
weekly→⌈days/7⌉, biweekly→⌈days/14⌉, monthly→months touched), coverage %, the meeting
rows, and both EPR participations. Readable by the assigned AL TL, the owning HBPR and
staff; the action consumes the viewset's scoped queryset **without** the `?year=` row
filter (it collides with `reporting_year` and would drop every cadence row —
`_scoped_queryset` exists for exactly this).

**Employee EPR stage evidence** — `EPRStageRecord` (one per cycle+stage, `summary`
required, `reference_url` for the review artifact e.g. Workday, `recorded_by`,
`shared_with_employee`). `POST .../epr-cycles/{id}/complete_stage/` is the **only**
writer of `*_completed_at` — it stamps the stage and creates the record atomically
(the three timestamp fields are read-only on PATCH, same rule as
`Absence.addressed_on`); a bare click is not evidence. Corrections go through
`epr-stage-records/` PATCH/DELETE (owner TL/staff; no create). The employee sees
`stage_summaries` on My Records only where `shared_with_employee`; an HBPR sees
evidence-**existence** metadata (`has_reference`, `recorded_by_name`) on embedded
`stage_records`, never summary text or the URL — mirrors notes redaction. The
standalone `epr-stage-records/` endpoint serves the **full** serializer, so it is
`hbpr_no_access` (the embed is the HBPR's only read path); `complete_stage` also
guards the URL (length + format — `objects.create` skips `full_clean`), turns the
unique-constraint race into 409, and re-fetches the cycle before serializing so the
200 response carries the record it just created (the prefetch cache predates it).

**Employee EPR goals** — Workday remains authoritative. `EPRGoal` stores only the
operational titles the TL confirms; goal details, reviews and ratings stay outside
this app. `POST .../epr-cycles/{id}/parse_goal_pdf/` is preview-only: it accepts a
bounded `.pdf` upload, extracts titles from the Workday `Goals`/`Weight:` layout,
and returns `goal_titles` without creating goals, stage records, timestamps or any
file persistence. Goal Setting and Mid-year can send `goal_titles` to
`complete_stage`; the title replacement, evidence row and stage timestamp commit
atomically. Mid-year without `goal_titles` confirms the existing ≥5 set. Final
Review rejects `goal_titles`, and standalone `epr-goals/` is read-only so goals can
never bypass checkpoint locks.

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

- `/hbpr` workspace (`HbprWorkspacePage`, `app` layout) — the HBPR-only user's
  home: `/dashboard`, login, and `HbprRestrictedRoute` all redirect straight to
  it (there is no HBPR dashboard — `primaryDashboard` keeps `"hbpr"` as a
  routing token only, and the DashboardPage redirect is guarded on the route
  being registered so a disabled plugin can't loop). With URL-backed view, year,
  leader, kind (`pips|promotions|idle|absences|meetings|reviews` — shared with the
  notification deep links), status, period and page. Desktop table, mobile cards.
  Records and evidence are paged **server-side** (one kind / one page per request):
  `GET .../hbpr/records/?kind=&leader=&status=&period=&limit=&offset=` returns
  `{count, results}` and delegates to the resource viewsets, so scope and redaction are
  reused, never copied (`plugins/tl_scorecard/hbpr_records.py`); evidence uses the
  evidence viewset's DRF `page` plus `period_year` and `leader` filters. `kind` is
  required (the mixed "all types" view was dropped).
- `/tl-scorecard` is the AL-TL authoring workspace (`components/scorecard/*`); an
  HBPR-only viewer is redirected to `/hbpr` before any query fires. The page is
  three URL-backed tabs — `?tab=` overview (default: scorecard metrics +
  governance actions) / records / evidence — and each tab's queries are
  `enabled`-gated on it, so no fetch fires for a surface that isn't rendered.
  The **Evidence** tab owns the HBPR partnership surface: the "HBPR
  partnership" section reads `GET /api/plugins/tl_scorecard/partnership/`; its
  **Evidence pack** button opens `EvidencePackDialog`, which fetches
  `year-end-pack` on open. In the EPR section a stage button opens
  `CompleteEprStageDialog` (summary required, optional reference link and
  "Share with employee"). Goal Setting and Mid-year additionally expose a
  Workday PDF preview plus editable goal rows; Final Review exposes neither.
  Completing a stage can no longer be a bare click, and each completed stage
  renders its recorded evidence inline. Stages complete strictly in order
  (Goal Setting → Mid-year → Final Review): `complete_stage` returns 400 while an
  earlier stage is open, and the UI disables the later buttons.
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

- **2026-10-04, EPR evidence parity + year-end pack:** `EPRCycle` was the only
  record type without evidence fields — a stage completed with one bare PATCH
  click, so the "100% timely EPR" KPI measured clicks, not reviews. Now
  `EPRStageRecord` (unique per cycle+stage) carries the required summary,
  `reference_url`, `recorded_by` and a per-stage `shared_with_employee` flag;
  `complete_stage` writes timestamp+evidence atomically and `*_completed_at`
  is read-only on PATCH (the `addressed_on` rule). My Records returns
  `stage_summaries` for shared rows only; the HBPR embed on `EPRCycleSerializer`
  shows existence metadata, never content. `year-end-pack` packages
  held-vs-expected cadence + both EPR participations per assignment+year —
  its `?year=` had to bypass the viewset's `reporting_year` row filter or it
  dropped every `NULL`-year cadence meeting (`_scoped_queryset` split out for
  it). `epr_metrics` gained `stages_completed`/`stages_with_evidence` so
  pre-change bare completions stay visible. Frontend: `CompleteEprStageDialog`,
  inline stage evidence in `EPRSection`, `EvidencePackDialog` on the
  partnership section, shared summaries in `EprReview`.

- **2026-10-04, audit of the last 21 commits (PRs #9–#25):** two defects in the records 
  search/CSV work (#24), fixed test-first. (1) `?q=` matched the private `notes` column, so an HBPR 
  could probe a TL's hidden notes by hit/miss — reproduced for idle/absence/PIP/promotion/meeting 
  before the fix; `private_search_fields` now restricts `notes` to the owner (staff: all). 
  (2) CSV cells were written verbatim, so free text such as `=HYPERLINK(...)` ran as a formula in 
  Excel; the server and client writers now prefix `'`. (3) record lists ran one query per meeting attendee / idle update (`attendees__user`, 
  `status_updates__recorded_by` now prefetched), which the 2000-row CSV multiplied. Cleared on inspection: `is_current` vs 
  `unfinished_q` (both UTC), `reference_url` rendering (`rel=noopener`, `URLField`). Open, not 
  changed: the assignment-archive purge deletes on a GET (documented, no audit entry); 
  `role_codes__icontains='hr'` in the Users role filters is substring-based.

- **2026-10-05, scorecard tabs + KPI-coverage removal:** `/tl-scorecard` gained a
  third, URL-backed **Evidence** tab (`?tab=evidence`) that owns
  `HbprPartnershipSection` + `EvidenceExportSection`; every page query is now
  `enabled`-gated on its tab (records/evidence no longer fire scorecard/EPR/
  partnership fetches). The static `KPI_COVERAGE` catalog was removed end to
  end — `kpi-coverage` action, `KpiCoverageEntrySerializer`, `KpiCoveragePanel`,
  `KpiCoverageEntry`/`KpiStatus`, `getKpiCoverage`, and the "KPI Coverage"
  workbook sheet — because it shipped developer-facing build status ("Phase 3 /
  planned / needs HR taxonomy") inside what is supposed to be an evidence
  artifact; the workbook is now Summary + Governance + HBPR evidence. The
  hardcoded `Last synced: Just now` header text was removed (it was literal
  fiction). The engagement plugin's `sidebar-nav` slot now declares
  `section: "leadership"` — without a `section` a slot item falls into the
  generic "Plugins" bucket, which is where the engagement link sat.

- **2026-10-06, HBPR dashboard removed (plan
  `.devin/plans/plan-hbpr-tables-buttons-dashboard-removal-2026-10-04.md` §3):**
  the `hbpr-dashboard` injection slot + `HbprDashboardPage` widget are deleted —
  `/hbpr` (the management workspace) IS the HBPR home. `DashboardPage` redirects
  `isHBPROnly` → `/hbpr` guarded on the `/hbpr` route being registered (an
  unconditional Navigate would loop through the catch-all when the plugin is
  off); `LoginPage` sends HBPR-only logins there (after the CR checks — an
  HBPR+CR user keeps the CR home); `HbprRestrictedRoute` and the nav's core
  "Dashboard" item point at/hide it accordingly. `"hbpr"` survives as a
  `DashboardType` member only as a routing token: it is never pushed into
  `availableDashboards`, but `primaryDashboard = "hbpr"` for HBPR-only feeds
  the redirect and keeps `useDashboardData`'s `!== "hbpr"` self-service fetch
  guard working (their overtime/standby/leave must never be requested — the
  API refuses via `HbprBlockedMixin`).

- **2026-10-06, AL TL is not scored by an IT TL; "Evidence" → "Partnership log":** every
  record write/read and scorecard metric used `get_team_member_ids()`, which includes an
  Albanian TL who sits in an Italian TL's team (direct `italian_tl` FK or shared team), so
  an IT TL could open PIPs, EPR cycles, flags and nominations on them and count them in team
  metrics. All of it now goes through `plugins/tl_scorecard/scope.scoreable_member_ids()`
  (team ids minus `albanian_tl` role holders); an AL TL is governed only through the HBPR
  partnership. The `My records` sidebar link is hidden for AL TLs (they are never a subject
  of those records). User-facing copy no longer says "evidence" for the HBPR↔AL TL surface:
  tab/section = **Partnership log**, entries = *log entries*, the year-end deliverable =
  **Year-end summary**, workbook sheet = "HBPR partnership log". Code identifiers, API
  routes and `?view=evidence` deep links are unchanged on purpose. Pinned by
  `test_al_tl_not_scoreable.py`.

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
