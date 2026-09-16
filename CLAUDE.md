# Engineering Tracker — Senior Full-Stack Overlay

Senior full-stack engineer for a Django + React codebase. Preserve
permissions, business-day leave, calendar privacy, OT/standby monthly
lock, and `PayrollRunEntry` invariants. Prefer TDD. Keep diffs minimal.

## Universal Safety Rules

- Do not bypass security checks, migrations, hooks, or tests.
- Never commit or push unless explicitly requested.
- Do not scan unrelated documentation, generated files, logs, node_modules, venv, or .git.
- Use TDD for implementation and bug fixes (write/update targeted test -> fail -> implement -> pass).

## Minimal Code & YAGNI Execution Ladder

Before writing or modifying any code, follow this mandatory 7-step ladder:

1. **YAGNI Gate:** Ask "Is this feature or abstraction explicitly requested?" If not, do not build it.
2. **Reuse First:** Search the codebase for existing utilities, UI components, serializers, or services before creating new ones.
3. **Standard Library:** Prefer native Python standard libraries or built-in JavaScript/React features over custom helper functions.
4. **Existing Dependencies:** Use packages already present in `requirements.txt` or `package.json`. Do not introduce new packages without permission.
5. **Smallest Viable Diff:** Choose the smallest clean change (e.g., single-line fix or minor function edit) over multi-file refactoring.
6. **Zero Speculative Code:** No placeholder methods, unused parameters, unneeded catch blocks, or "future-proofing."
7. **Verify & Validate:** Run targeted tests to verify the minimal change before completing the task.

## Terminal Hygiene & Output Bounding

- **Quiet Flags:** Always run terminal commands with quiet/concise flags (`pip install -q`, `npm install --silent`, `python -m ruff check --output-format=concise`).
- **Targeted Reads:** Use bounded output (`head`, `tail`, `git diff --stat`, or targeted `grep`) instead of dumping raw log files or huge terminal outputs into the context window.
- **Excluded Paths:** Exclude `node_modules/`, `venv/`, `.git/`, generated bundles, logs, and `.devin/tracking/` archives from broad searches unless explicitly requested.
- **Execution Strategy:** Run only targeted unit tests while iterating; run the full verification suite exactly once at the end of implementation.

## Quick Start

`python manage.py runserver` (repo root) and `npm run dev` (from `frontend/`).

## Task Router — Keyword → On-Demand Context

| Keywords | Load | Why |
|---|---|---|
| permission, role, auth, access, group, TL scope | `.devin/context/01-PERMISSIONS.md` | Most complex system; easy to break |
| model, field, migration, queryset, schema | `.devin/context/02-DATA-MODELS.md` | Entity relationships before queries |
| component, hook, page, context, React, CSS, visual, mobile, frontend test | `.devin/context/03-FRONTEND-PATTERNS.md` | Composition + test conventions |
| screenshot, fingerprint, visual verify/diff, UI refactor verification | `.devin/context/12-VISUAL-VERIFICATION.md` | Fingerprint capture + diff tooling |
| modal, dialog, form dialog, confirm, drawer | `.devin/context/03-FRONTEND-PATTERNS.md` §13 | Dialog contract + tone scale — then `node scripts/modal-audit.mjs` |
| checkbox, bulk edit, bulk action bar, selection count | `.devin/context/03-FRONTEND-PATTERNS.md` §14 | Reuse the shared checkbox/badge/entrance treatment |
| animation, motion, transition, hover effect, reduced motion | `.devin/context/03-FRONTEND-PATTERNS.md` §10 | `lib/motion.ts` tokens + reduced-motion gate requirement |
| status color, tone, palette color, badge color | `.devin/context/03-FRONTEND-PATTERNS.md` §15 | tone.ts semantics; check the "not migrated" list first |
| endpoint, serializer, ViewSet, API, URL, service | `.devin/context/04-API-PATTERNS.md` | DRF + service layer patterns |
| add feature, new page, new endpoint, end-to-end | `.devin/context/05-COMMON-TASKS.md` | Step-by-step recipes |
| overtime, standby, leave, balance, MonthlyLock, carryover | `.devin/context/06-DOMAIN-INVARIANTS.md` | Domain rules that must not break |
| payroll, wage, payslip, gross-to-net | `.devin/context/PLUGINS/01-payroll.md` | Payroll lifecycle invariants |
| control room, CR, standby projection | `.devin/context/PLUGINS/02-control-room.md` | CR scoping rules |
| ticket, KPI, evidence upload | `.devin/context/PLUGINS/03-ticket-kpi.md` | Ticket KPI invariants |
| skills, proficiency, matrix, gap report, skill rating | `.devin/context/PLUGINS/04-skills.md` | Skills plugin invariants |
| organigrama, org chart, Tech grouping | `.devin/context/PLUGINS/05-organigrama.md` | Live chart + builder invariants |
| import, CSV, Excel, bulk upload, data import, sample template, importer | `.devin/context/PLUGINS/06-data-import.md` | Importer contract + per-target authority |
| backup, restore, site backup | `.devin/context/PLUGINS/07-backup-restore.md` | Backup/restore invariants: PK-based fixture, dependent closure, superuser-only |
| calendar, workspace, workspace_users | `.devin/context/07-CALENDAR.md` | Calendar privacy + workspace rules |
| chart, Recharts, analytics visualization | `.devin/context/08-ANALYTICS-VISUALIZATION.md` | Chart sizing + data-source rules |
| plugin permission, render surface, plugin slot, metadata, resource access, remove/disable a plugin | `.devin/context/09-RESOURCE-ACCESS.md` + `.devin/context/10-PLUGIN-PERMISSIONS.md` | Group grants, plugin gates, removal safety |
| file location, where is, find file | `.devin/context/PROJECT_INDEX.md` | Directory inventory |
| plan, create plan, megaplan, refactor plan, optimize plan, plan review | `.devin/context/11-PLAN-CREATION.md` | Senior plan protocol: zero-hallucination specs + self-correcting gates |
| past bug, session history, what changed | `AGENTS.md` (recent) + `.devin/tracking/agents-archive-*.md` | Session logs |
| production security, deploy, Docker, TLS, CORS, gunicorn | relevant production-security plan + `.devin/context/04-API-PATTERNS.md` | Deployment hardening rules |
| cross-stack impact, blast radius, call graph, type hierarchy, find usages across Django↔React | `.devin/context/trace-mcp.md` (usage guidance) + trace-mcp MCP server (`get_change_impact`, `get_call_graph`, `find_usages`) | Precomputed graph — use instead of 10 grep/read calls |

## Hot Invariants

- **Permissions** — multi-role users are normal. Pure-HR write block uses `is_hr_only()`. TL scope is `get_team_member_ids()`. Never ORM-filter removed `profile__is_team_leader` or `profile__team` columns.
- **CR-scoped UI** — CR-only users/admins get no My Clients, no notification preferences in Settings, no Organigrama sidebar injection. Multi-role CR identities keep their higher-role behavior.
- **Business-day leave** — use `count_business_days` for validation, deduction, reports, insights, and exports. Field names are `request_type` and `reason`. There is no `LeaveType` model.
- **Team member resolution** — `get_team_member_ids()` combines direct `italian_tl`/`albanian_tl` FK + shared `TeamMembership` M2M + `led_teams`. Use it for every TL approval, filter, or visibility check.
- **Calendar invariants** — team calendars must be created with `is_public=False`. Use `useValidWorkspaceIds`, never raw `selectedWorkspaceIds`. `calendar_group` shares *workspaces*, not users. `get_users_for_workspace()` returns only the workspace's own team members.
- **OT/standby monthly lock** — `MonthlyLockMixin` blocks owner updates and deletes in past months. Non-pending locked records are superuser-delete only; pending bypass the lock. Frontend `deleteLog` must append `?ignore_date_filter=true`; `canDelete` = `isSuperuser || !isPastMonth`.
- **PayrollRunEntry guard** — `OvertimeLogViewSet`/`StandbyLogViewSet` `perform_destroy` return 400 if `PayrollRunEntry` references the record. Superuser override deletes of non-pending locked records are audit-logged.
- **Tech levels** — `UserProfile.techs` is a `through=UserTech` M2M carrying the grade held per Tech (`TechLevel`, per-Tech ordered scale, `rank` int). `UserTech` is a plain `models.Model` on the pre-existing `user_profiles_techs` table with `db_column='userprofile_id'`; migration `0015` is `SeparateDatabaseAndState` with zero database operations — never regenerate it, `makemigrations` would try to CREATE a table that already exists and destroy every assignment. It must NOT inherit `BaseModel`: M2M descriptors ignore `is_deleted`, so a soft-deleted join row would still read as assigned. Every write goes through `apps/users/services/tech_assignments.py`, which accepts both `[1,2]` (legacy, preserves existing levels) and `[{"tech":1,"level":3}]`; `.techs.set()`/`.add()` still work and record `level=NULL`. A level only grades its own Tech (enforced in `clean()` + serializer, not in the DB). `?tech`, `?tech_level` and `?min_tech_level_rank` must stay inside ONE `tech_assignments` lookup or a person's grade in one Tech leaks into another. Tech level is NOT the Skills plugin's proficiency — different axis, keep them separate.
- **Skills Matrix** — read `PLUGINS/04-skills.md` first. Keep public `view` access with queryset/object scoping, TL scope via `get_team_member_ids()`, and use matrix `user_skill_id` (not `skill_id`) for rate mutations.
- **Frontend plugin service URLs** — axios `baseURL` already ends in `/api`, so plugin services use `BASE = "/plugins/<name>"`, never `"/api/plugins/<name>"` (doubled `api/` → 404). Tests mock the API layer and do not catch this.
- **React Query keys** — include every result-changing parameter (userId, workspaceScope, page_size, month/year filters). Never build a constant key with conditionals like `condition ? scope : "self"`.
- **Dialog contract** — width via `size` (sm 448 / md 512 / lg 672 / xl 896); never pass `max-w-*`, `flex`/`overflow` or `p-0` to `DialogContent` (use `padded={false}`, `hideClose`). One scroll region: `DialogBody`. `cn` is tailwind-merge — prefixed and unprefixed classes are SEPARATE merge groups, so a callsite class does not always win. Colors use tone tokens (`bg-tone-<t>-surface`, `text-tone-<t>-text`) which carry the light/dark pair, so `dark:` is a bug. Done = `node scripts/modal-audit.mjs` exit 0.
- **Checkboxes/bulk bars/count badges** — reuse `Checkbox`/`TriStateCheckbox` as-is and the gradient `AnimatedNumber` badge from `BulkActionBar`/`BulkDrawerHeader` — never a flat `bg-primary` circle or an unanimated bulk bar.
- **Motion system** — `frontend/src/lib/motion.ts` is the single source of truth for durations, easings, shared framer-motion variants, `LAYOUT_ID` constants (`layoutId` strings that must match across files — do NOT merge unrelated `layoutId`s together, only genuinely coordinated ones like the two admin-plugin sidebar items), and `hoverLiftClass`/`hoverScaleClass` CSS-only hover tokens. Any new `motion.*` usage MUST be reduced-motion-safe: either call `useReducedMotion()` directly (GlassCard/LoginPage pattern) or wrap the transition with `useMotionTransition()` from `lib/motion.ts`. The global `index.css` reduced-motion override only stops CSS transitions, NOT framer-motion's JS-driven springs — `AnimatedNumber`'s `useSpring` is the reference example of why the per-component gate is still required.
- **Plugin removal safety** — core code and other plugins must NEVER statically import a plugin's modules. Register the component in `frontend/src/plugins/index.ts` and consume it via `getPluginComponent(plugin, component)` behind a core-owned wrapper gated on `usePlugins().activePlugins` (`PluginSlot`, `components/admin/PluginImportButton`). `remove_plugin` detects cross-plugin **Python** imports only and matches frontend files by **filename**, so a stray TS import passes its dry run and breaks `npm run build` on removal. Check before claiming removability: `grep -rn "plugins/<name>" frontend/src | grep -v "^frontend/src/plugins/<name>/"` — only `frontend/src/plugins/index.ts` may match.
- **Plugin permission actions are fixed** — `view`/`manage`/`configure`/`export` only; `validate_manifest` raises on anything else, so a per-feature action can never be seeded and denies every non-staff user. Scope inside the plugin's viewsets instead.
- **Data import** — the importer class is the single source of truth for a target's fields, options, sample rows and authority. Never branch on `target_key` in the frontend. Each importer's `check_authority` re-applies the authority its own admin page requires, so the plugin `manage` grant does not unlock every target; the same scoping covers profiles and batch history (`row_errors` quotes cell values). Upload size is checked before the file is parsed. Template downloads use `file_format=`, not `format=` (DRF reserves it). A blank cell means "leave this alone", booleans included — this now holds on UPDATE for every optional field across all importers (`public_holidays.is_global` included; its `_parse_bool_optional` returns `None` for a blank cell instead of falling back to the create-time default). `CodeKeyedImporter.commit_row` validates every `required=True` field from `get_fields()` before create/update and returns a clean `"<key> is required."` row error instead of a raw DB exception. The downloadable template marks required columns with a trailing `" *"` on the header label; `core/utils/tabular_file.normalize_columns` strips that suffix before alias matching, so a filled-in template still auto-detects on re-upload. `overtime_logs`/`standby_logs` importers exist (bypass the viewset via ORM like every importer — `MonthlyLockMixin` only gates `update`/`destroy`, never `create` — and land already `approved`); their optional `generate_draft_payroll` option only ever produces a **draft** `PayrollRun` (never auto-finalized) and is wrapped so a Payroll-side failure is recorded as a skip, never rolls back the already-committed log import. Read `.devin/context/PLUGINS/06-data-import.md` before adding a target.
- **UI/accessibility baseline** — reuse shared primitives (`GlassCard`, `StatCard`, `DataTable`, `EmptyState`, `ConfirmDialog`) and theme tokens; no raw hex or slate/zinc/gray. New controls need accessible labels, keyboard behavior, 320px+ layout, light/dark check. See `03-FRONTEND-PATTERNS.md` §10-11.
- **Dependency/build files** — `.gitignore`'s venv block must keep anchored `/lib/` `/lib64/` (bare patterns once excluded `frontend/src/lib/` from every commit). `Dockerfile` installs `requirements.txt` + `requirements-production.txt` in ONE `pip install` — splitting lets an unconstrained second install upgrade Django/DRF and break the build.
- **Removed plugins / dead code** — never reference: `budget`, `email_notifications`, `export` plugins; `EmailTemplate`, `EmailNotificationRule`, `send_notification_email`, `trigger_notification_rule`, `send_upload_reminders`, `upload_reminder`; `UserViewSet.import_users`; `manual_export_check.py`; `Skill.display_order`/`SkillCategory.display_order` (gone in migration `0005`; ordering is A-Z by `name`).
- **Site backup/restore** — hard-gated to `is_superuser` only (`SuperuserOnlyMixin` in `plugins/site_backup/viewsets.py`), stricter than the platform's usual staff-or-plugin-manage-grant pattern, because a restore can overwrite or delete any row. `dumpdata` deliberately omits `natural_foreign`/`natural_primary`: any model defining `natural_key()` (e.g. `auth.Group`, `auth.Permission`) has its PK stripped by those flags and re-resolved by natural key against whatever the DB looks like *at restore time*, which silently reassigns PKs and breaks the PK-based new/overwritten/db_only classification the restore preview depends on — do not re-add them. `contenttypes`/`sessions`/`site_backup` are excluded from every fixture. The FK dependent-closure graph (`services/dependency_graph.py`) is built from Django's own `_meta.related_objects`, not hand-rolled DB introspection. A model's "rows missing from the backup" are only ever deleted when explicitly opted into per-model via `delete_missing_models` — approving a model for create/update never implies deletion. `migration_state_hash` (sha256 of the applied-migrations set) blocks restoring a backup onto a schema it wasn't taken from. Read `.devin/context/PLUGINS/07-backup-restore.md` before touching this plugin.

## Skill Triggers

| Task | Skill |
|---|---|
| Any implementation or bugfix | `test-driven-development` |
| Backend query/perf change | `django-perf-review` |
| Auth/permission/input change | `security-review` |
| Code review requested | `review` |

## Verification Commands

Targeted while iterating; the full pass exactly once, after implementation.

```bash
# Iterating — narrow the path, never the whole suite
python manage.py check
python manage.py test apps.<app>.tests.<name>
cd frontend && npx vitest run src/<path> && npx eslint src/<path>