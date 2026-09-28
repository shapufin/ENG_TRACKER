# Django 6 Upgrade (Phase 1 of 7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Django 5.2.17 → 6.1.1 on the `upgrade/django-6` branch, with the full plugin registry and every app audited, the existing test suite green, and the Upgrade Journal recording exactly what changed — without bumping DRF/drf-spectacular/django-filter unless Django 6 forces it.

**Architecture:** No new subsystems. This is a dependency-version change plus whatever fixes it forces, applied app-by-app and plugin-by-plugin so a failure is traceable to one area at a time. Research happens before the bump (so fixes are informed, not reactive); verification happens after each group of fixes (so a break is caught at the smallest possible diff).

**Tech Stack:** Django 6.1.1, existing DRF 3.18.1 / drf-spectacular 0.30.0 / django-filter 26.1 (verified, not bumped unless forced), Python 3.12 (already CI's version), existing plugin registry.

**Spec:** [docs/superpowers/specs/2026-09-28-major-dependency-upgrades-design.md](../specs/2026-09-28-major-dependency-upgrades-design.md)

## Global Constraints

- Target version: `Django==5.2.17` -> `Django==6.1.1`. Exact pin, not a range.
- Do not bump `djangorestframework==3.18.1`, `drf-spectacular==0.30.0`, or `django-filter==26.1` unless `pip install Django==6.1.1` or the test suite surfaces a hard incompatibility forcing it. If forced, record the forced bump in the journal with the exact error that forced it.
- Work only on branch `upgrade/django-6`. Never commit to `main` directly. Never push unless the user explicitly asks (per project CLAUDE.md).
- Smallest viable diff per fix — no unrelated refactors, no speculative changes, no new abstractions (per project CLAUDE.md's YAGNI ladder).
- `apps/users/models/core.py`'s `UserTech` model and its migration `0015` (a zero-op `SeparateDatabaseAndState`) must never be regenerated. If `makemigrations --check --dry-run` reports drift touching that migration, stop and treat it as a go/no-go blocker, not a routine fix.
- `PayrollRunViewSet`'s line-level scoping (`_allowed_payroll_user_ids`, `_scoped_lines`, `_ensure_unrestricted`) must keep behaving identically — a TL must still only see their own team's lines even though they can reach the run.
- Optional-plugin imports must keep using `except ImportError:` only — never widen to bare `except Exception:` while fixing something else.
- Manual verification's go/no-go items (see Task 10) block the merge on failure; nice-to-have items do not.
- Upgrade Journal entries use the exact template from the spec's "Phase template" step 9.

## Review Focus

- **Migration-drift silently touching `UserTech`'s migration 0015** — Django 6 could change how `SeparateDatabaseAndState` or M2M-through introspection works, making `makemigrations --check --dry-run` want to regenerate it. A reasonable person expects the check to pass cleanly with zero drift; a passing full test suite would not by itself catch this. → tested in Task 6.
- **Payroll line-level scoping silently reopening (IDOR regression)** — a Django queryset API Django 6 deprecates/changes behind `_scoped_lines`/`_ensure_unrestricted` could make a TL see another team's salary lines again. A reasonable person expects this to be caught before merge, not in production. → tested in Task 5.
- **A plugin silently failing to register instead of raising** — if Django 6 changes app-loading/import timing, a plugin could stop appearing in the sidebar without any exception surfacing in `manage.py test`. A reasonable person expects a broken plugin to be loud, not silently absent. → tested in Task 4 (registry) and Task 10 (manual, non-admin role sees expected plugin pages).
- **Fail-open exception handling creeping back in** — while fixing a Django-6-triggered break in `CanViewReports` or similar optional-plugin-import code, it would be easy to "fix" a new exception type by widening `except ImportError` to `except Exception`, silently reintroducing the fail-open bug closed on 2026-09-27. A reasonable person expects that fix to stay narrow. → tested in Task 5.
- **Admin login rate-limiting silently disabled** — the nginx-level rate limit on `/admin/login/` depends on request metadata Django produces; a Django 6 change to request/response internals could alter headers in a way that breaks the nginx match without any Django-side test failing. A reasonable person expects brute-force protection to still work after a backend upgrade. → tested in Task 10 (manual, go/no-go).

---

## Task 1: Branch setup and baseline verification

**Files:** none (no code changes — this task establishes a known-good starting point)

**Interfaces:**
- Produces: confirmation that `main`'s test suite is green *before* any dependency change, so any later failure is attributable to this upgrade.

- [ ] **Step 1: Create the branch**

Run: `git checkout -b upgrade/django-6`

- [ ] **Step 2: Run the full backend suite on the unmodified branch**

Run: `python manage.py test -v 1`
Expected: all tests pass (this is the baseline; record the pass count/time for comparison after the bump)

- [ ] **Step 3: Run the pre-bump system and migration checks**

Run: `python manage.py check` and `python manage.py makemigrations --check --dry-run`
Expected: both clean (no errors, no drift) — if either fails on unmodified `main`, stop and resolve that first; it is a pre-existing issue, not part of this upgrade.

## Task 2: Research Django 6 changes relevant to this codebase

**Files:**
- Create: `docs/superpowers/plans/2026-09-28-django-6-research-notes.md` (working notes consumed by Tasks 3-9; folded into the Upgrade Journal entry in Task 11, not kept long-term)

**Interfaces:**
- Consumes: nothing
- Produces: a written list of Django 6.0 and 6.1 deprecations/breaking changes plausibly relevant to: queryset/ORM methods, app-loading/import machinery, cache framework, admin internals, migration framework, `SeparateDatabaseAndState` behavior, DRF/drf-spectacular/django-filter's stated Django-6 support. Tasks 3-9 reference this file instead of re-deriving it.

- [ ] **Step 1: Fetch current Django 6.0 and 6.1 release notes and deprecation timeline via Context7 (or the official Django docs if Context7 lacks them)**

Focus the query on: removed/changed queryset and ORM APIs, changes to `django.apps` loading, cache framework changes, admin changes, migration framework changes, template engine changes (in case Tailwind's phase later needs this too — note but don't act on it now).

- [ ] **Step 2: Fetch DRF, drf-spectacular, and django-filter's own changelogs/issue trackers for Django 6 compatibility statements at the versions already pinned (3.18.1 / 0.30.0 / 26.1)**

Record whether each already claims Django 6 support at the pinned version, or whether a minimum bump is stated as required.

- [ ] **Step 3: Write the findings to `docs/superpowers/plans/2026-09-28-django-6-research-notes.md`**

One bullet per relevant change: what changed, why it's relevant to this codebase (reference the specific pattern from Global Constraints/Review Focus if applicable), which later task should address it.

## Task 3: Bump Django and resolve immediate check-level breakage

**Files:**
- Modify: `requirements.txt:4` (`Django==5.2.17` -> `Django==6.1.1`)
- Modify: whatever files `manage.py check` / `makemigrations --check --dry-run` point to once errors surface (exact paths unknown until the check runs)

**Interfaces:**
- Consumes: `docs/superpowers/plans/2026-09-28-django-6-research-notes.md` from Task 2
- Produces: a codebase where `manage.py check` and `makemigrations --check --dry-run` both pass cleanly on Django 6.1.1, ready for the app/plugin test tasks that follow.

- [ ] **Step 1: Bump the pin**

Edit `requirements.txt` line 4 to `Django==6.1.1`.

- [ ] **Step 2: Install and run the system check**

Run: `pip install -r requirements.txt` then `python manage.py check`
Expected: clean, or a list of errors pointing at specific deprecated/removed APIs.

- [ ] **Step 3: Fix each `check` error with the smallest viable diff**

For each error, apply the fix Django's error message or the Task 2 research notes indicate. Do not fix anything `check` doesn't flag.

- [ ] **Step 4: Re-run `check` until clean**

Run: `python manage.py check`
Expected: `System check identified no issues`

- [ ] **Step 5: Run the migration-drift check**

Run: `python manage.py makemigrations --check --dry-run`
Expected: clean, zero drift. If drift is reported against `apps/users/migrations/0015_*` (the `UserTech` zero-op migration), stop — this is the Global Constraints blocker, not a routine fix; escalate rather than resolving unilaterally.

- [ ] **Step 6: Commit**

```bash
git add requirements.txt
git commit -m "chore: bump Django to 6.1.1, resolve system check errors"
```

## Task 4: Fix core apps (permissions, users, dashboard, reports, overtime/standby)

**Files:**
- Modify: whichever files under `apps/permissions/`, `apps/users/`, `apps/dashboard/`, `apps/reports/`, `apps/overtime/` (or wherever OT/standby models live — confirm exact path via `get_outline`/`search`, not assumed) that the test run below flags
- Test: `apps/permissions/test_*.py`, `apps/users/tests_app/test_*.py`, `apps/dashboard/tests/test_*.py`, plus any test files for overtime/standby found in the codebase

**Interfaces:**
- Consumes: Django 6.1.1 installed and `check`-clean from Task 3
- Produces: these apps' tests passing under Django 6.1.1, and confirmation that `apps/reports/viewsets.py`'s `CanViewReports.has_permission` still catches only `ImportError` (Global Constraint), and that `MonthlyLockMixin`'s past-month blocking still works.

- [ ] **Step 1: Run this app cluster's tests in isolation**

Run: `python manage.py test apps.permissions apps.users apps.dashboard apps.reports -v 1` (add the overtime/standby app's test path once located)
Expected: failure list, if any, scoped to Django-6-caused breaks (not pre-existing failures — compare against Task 1's baseline).

- [ ] **Step 2: For each failure, read the failing test and the code it exercises, then fix with the smallest viable diff**

If a fix touches `apps/reports/viewsets.py`'s `CanViewReports`, re-read the existing `except ImportError:` block first — the fix must not widen it to `except Exception:`.

- [ ] **Step 3: Add a regression assertion for fail-closed behavior if none exists**

Write/confirm a test asserting `CanViewReports.has_permission` denies (not grants) access when the `control_room` import raises something other than `ImportError` (e.g. monkeypatch the import to raise `RuntimeError` and assert permission is still denied, not silently granted). This is the Review Focus item on fail-open regressions.

- [ ] **Step 4: Re-run this cluster's tests**

Run: `python manage.py test apps.permissions apps.users apps.dashboard apps.reports -v 1` (plus overtime/standby)
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/permissions apps/users apps/dashboard apps/reports
git commit -m "fix: resolve Django 6 breakage in core apps"
```

## Task 5: Fix plugin group A (control_room, payroll, organigrama)

**Files:**
- Modify: files under `plugins/control_room/`, `plugins/payroll/`, `plugins/organigrama/` flagged by the test run
- Test: `plugins/control_room/test_*.py`, `plugins/payroll/tests/test_*.py`, `plugins/organigrama/tests/test_*.py`

**Interfaces:**
- Consumes: Django 6.1.1 from Task 3, core apps green from Task 4
- Produces: these plugins' tests passing, and confirmation `PayrollRunViewSet`'s line-level scoping is unchanged (Global Constraint / Review Focus).

- [ ] **Step 1: Run this plugin cluster's tests in isolation**

Run: `python manage.py test plugins.control_room plugins.payroll plugins.organigrama -v 1`
Expected: failure list, if any, scoped to Django-6 breaks.

- [ ] **Step 2: For each failure, fix with the smallest viable diff**

- [ ] **Step 3: Confirm the existing payroll scope-leak regression test still exists and passes**

Locate and run `plugins/payroll/tests/test_scope_leak.py` specifically:
Run: `python manage.py test plugins.payroll.tests.test_scope_leak -v 2`
Expected: pass. If this file's assertions were weakened or removed by any Task 5 fix, that is a hard stop — restore the original assertion strength.

- [ ] **Step 4: Re-run the full cluster**

Run: `python manage.py test plugins.control_room plugins.payroll plugins.organigrama -v 1`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/control_room plugins/payroll plugins/organigrama
git commit -m "fix: resolve Django 6 breakage in control_room, payroll, organigrama plugins"
```

## Task 6: Fix plugin group B (skills, ticket_kpi, data_import, site_backup)

**Files:**
- Modify: files under `plugins/skills/`, `plugins/ticket_kpi/`, `plugins/data_import/`, `plugins/site_backup/` flagged by the test run
- Test: `plugins/skills/tests/test_*.py`, `plugins/ticket_kpi/test_*.py`, `plugins/data_import/test_*.py`, `plugins/site_backup/tests/test_*.py`

**Interfaces:**
- Consumes: Django 6.1.1 from Task 3
- Produces: these plugins' tests passing, and a confirmed-clean `makemigrations --check --dry-run` re-run scoped to `apps.users` (where `UserTech` lives) after all fixes so far — the Global Constraint's highest-risk item gets checked again here since `skills`/`data_import` both touch tech-assignment-adjacent data paths.

- [ ] **Step 1: Run this plugin cluster's tests in isolation**

Run: `python manage.py test plugins.skills plugins.ticket_kpi plugins.data_import plugins.site_backup -v 1`
Expected: failure list, if any, scoped to Django-6 breaks.

- [ ] **Step 2: For each failure, fix with the smallest viable diff**

- [ ] **Step 3: Re-check migration drift specifically for `apps.users`**

Run: `python manage.py makemigrations apps.users --check --dry-run`
Expected: clean. If drift appears against migration `0015`, stop — Global Constraints blocker.

- [ ] **Step 4: Re-run the full cluster**

Run: `python manage.py test plugins.skills plugins.ticket_kpi plugins.data_import plugins.site_backup -v 1`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/skills plugins/ticket_kpi plugins/data_import plugins/site_backup
git commit -m "fix: resolve Django 6 breakage in skills, ticket_kpi, data_import, site_backup plugins"
```

## Task 7: Fix plugin group C (analytics, audit_log, engagement, tl_scorecard, notifications, onboarding)

**Files:**
- Modify: files under `plugins/analytics/`, `plugins/audit_log/`, `plugins/engagement/`, `plugins/tl_scorecard/`, `plugins/notifications/`, `plugins/onboarding/` flagged by the test run
- Test: `plugins/analytics/test_*.py`, `plugins/audit_log/test_*.py`, `plugins/engagement/test_*.py`, `plugins/tl_scorecard/test_*.py`, `plugins/notifications/test_*.py`, `plugins/onboarding/test_*.py`

**Interfaces:**
- Consumes: Django 6.1.1 from Task 3
- Produces: these plugins' tests passing, and confirmation the plugin registry's `injection_slots` mechanism still resolves for every plugin in this group (each has a sidebar/admin-sidebar entry per CLAUDE.md's "two slots" invariant).

- [ ] **Step 1: Run this plugin cluster's tests in isolation**

Run: `python manage.py test plugins.analytics plugins.audit_log plugins.engagement plugins.tl_scorecard plugins.notifications plugins.onboarding -v 1`
Expected: failure list, if any, scoped to Django-6 breaks.

- [ ] **Step 2: For each failure, fix with the smallest viable diff**

- [ ] **Step 3: Run the cross-plugin registry consistency test**

Run: `python manage.py test apps.plugins.test_registry_consistency -v 2`
Expected: pass — this is the direct test for "a plugin silently fails to register" (Review Focus item).

- [ ] **Step 4: Re-run the full cluster**

Run: `python manage.py test plugins.analytics plugins.audit_log plugins.engagement plugins.tl_scorecard plugins.notifications plugins.onboarding -v 1`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/analytics plugins/audit_log plugins/engagement plugins/tl_scorecard plugins/notifications plugins/onboarding
git commit -m "fix: resolve Django 6 breakage in analytics, audit_log, engagement, tl_scorecard, notifications, onboarding plugins"
```

## Task 8: Verify DRF, drf-spectacular, django-filter compatibility

**Files:**
- Modify: `requirements.txt` (only if a forced bump is discovered — record which line and why)
- Test: none new; exercises existing API schema and filter tests already in the suite

**Interfaces:**
- Consumes: Django 6.1.1, all apps/plugins green from Tasks 3-7
- Produces: confirmation these three packages work unmodified at their pinned versions, or a documented forced bump with the exact incompatibility that required it.

- [ ] **Step 1: Generate the OpenAPI schema drf-spectacular produces**

Run: `python manage.py spectacular --file /tmp/schema-check.yaml` (or the project's existing schema-check command if one exists — check `apps/*/management/commands` first)
Expected: generates without error.

- [ ] **Step 2: Run any existing django-filter-backed viewset tests to confirm filtering still works**

Run: `python manage.py test -v 1` for any test file exercising `?tech`, `?tech_level`, `?min_tech_level_rank` or similar filter-backed queries (search for `django_filters` usage first via `search`/`find_usages` to identify exact test files).

- [ ] **Step 3: If any of the three packages raise a version-floor error during `pip install`, bump only that package to the minimum version it states is Django-6-compatible, and document it**

Only do this if Step 1 or Step 2 fails with an explicit incompatibility from that package. Otherwise, no changes.

- [ ] **Step 4: Commit only if a bump happened**

```bash
git add requirements.txt
git commit -m "chore: bump <package> to <version> — required for Django 6 compatibility (<error>)"
```

## Task 9: Full suite, deployment check, and admin routing sanity

**Files:** none (verification only)

**Interfaces:**
- Consumes: everything from Tasks 3-8
- Produces: a fully green backend suite under Django 6.1.1, confirmation the production deployment check still passes with CI's exact settings.

- [ ] **Step 1: Run the entire backend suite once**

Run: `python manage.py test -v 1`
Expected: all pass, matching or exceeding Task 1's baseline pass count.

- [ ] **Step 2: Run the production deployment check with CI's exact environment**

Run (matching `.github/workflows/ci.yml`'s backend job):
```bash
SECRET_KEY=ci-deploy-check-secret-key-that-is-long-enough-for-django-check-50chars \
ALLOWED_HOSTS=localhost DB_NAME=ci DB_USER=ci DB_PASSWORD=ci DB_HOST=localhost \
REDIS_URL=redis://localhost:6379/0 USE_REDIS=true FRONTEND_URL=http://localhost \
ENABLE_API_DOCS=False \
python manage.py check --deploy --settings=config.settings_production
```
Expected: no new warnings/errors compared to a pre-bump run of the same command (run it once more on `main` if not already known, to diff against).

- [ ] **Step 3: Re-run the migration-drift check one final time across the whole project**

Run: `python manage.py makemigrations --check --dry-run`
Expected: clean.

## Task 10: Manual browser verification

**Files:** none

**Interfaces:**
- Consumes: a fully green backend from Task 9
- Produces: a pass/fail verdict against the spec's go/no-go and nice-to-have checklist.

- [ ] **Step 1: Start the backend and frontend dev servers**

Run: `python manage.py runserver` and (`cd frontend && npm run dev`), then open the app via the browser pane (`preview_start`).

- [ ] **Step 2: Go/no-go checks — each must pass or the merge is blocked**

  - Log in successfully.
  - Open `/admin/`: page loads, static assets render, log in there too.
  - Attempt several rapid failed logins against `/admin/login/`: confirm the rate limit still triggers (matches the nginx-level protection added 2026-09-27 — verifies Django's request handling didn't change in a way that breaks the nginx match, per Review Focus).
  - As a plain TL, open a payroll run containing another team's lines: confirm only the TL's own team's lines are visible (`_scoped_lines` — Review Focus item).
  - As a non-admin role, open one plugin-gated page (e.g. Skills Matrix or Ticket KPI): confirm it loads (proves plugin registry resolution — Review Focus item).

- [ ] **Step 3: Nice-to-have checks — log failures in the journal, fix if cheap, otherwise track as follow-up, do not block merge**

  - Export one payroll run to Excel and to PDF: confirm both render correctly.
  - Open one calendar view: confirm events display.

- [ ] **Step 4: Record the verdict**

If any go/no-go item failed and isn't yet fixed, return to the relevant Task (4-8) and fix before proceeding. Do not proceed to Task 11 until every go/no-go item passes.

## Task 11: Write the Upgrade Journal entry

**Files:**
- Create: `.devin/context/13-UPGRADE-JOURNAL.md` (first entry — file doesn't exist yet)
- Modify: `CLAUDE.md` Task Router table — add a row: `upgrade, major version, dependency bump` -> `.devin/context/13-UPGRADE-JOURNAL.md` -> `Cross-phase upgrade history and gotchas`

**Interfaces:**
- Consumes: `docs/superpowers/plans/2026-09-28-django-6-research-notes.md` (Task 2), every fix/deferral made in Tasks 3-9, the Task 10 verdict
- Produces: a journal entry future phases (reportlab, Tailwind, etc.) read before starting.

- [ ] **Step 1: Write the entry using the spec's exact template**

```
## Phase 1: Django — <date>

- Version: Django==5.2.17 -> Django==6.1.1 (plus any DRF/drf-spectacular/django-filter line from Task 8)
- Deprecation/breaking changes hit in this codebase: <fill from Tasks 3-9's actual fixes>
- Pinned-and-deferred (if any): <fill, or "none">
- New patterns/gotchas for future phases: <fill>
- Verification commands that worked: <the exact commands from Tasks 3, 9, 10>
```

- [ ] **Step 2: Add the Task Router row to CLAUDE.md**

- [ ] **Step 3: Delete the working research-notes file since it's now folded into the journal**

Run: `git rm docs/superpowers/plans/2026-09-28-django-6-research-notes.md`

- [ ] **Step 4: Commit**

```bash
git add .devin/context/13-UPGRADE-JOURNAL.md CLAUDE.md
git commit -m "docs: record Django 6 upgrade in Upgrade Journal"
```

## Task 12: Present diff for review

**Files:** none

**Interfaces:**
- Consumes: everything above
- Produces: nothing further from this plan — merge to `main` happens only after the human partner explicitly approves, per the spec's phase template step 10. This plan does not include a merge step.

- [ ] **Step 1: Summarize the full branch diff against `main`**

Run: `git diff main...upgrade/django-6 --stat`

- [ ] **Step 2: Present the summary, the Task 10 verdict, and the journal entry to the user for review**

Wait for explicit approval before merging. Merging is a separate, explicit action outside this plan's scope.
