# Upgrade Journal

Cross-phase history for the major dependency upgrade series
(spec: `docs/superpowers/specs/2026-09-28-major-dependency-upgrades-design.md`).
Read the relevant entry before starting a later phase — each records what the
previous phase actually hit in this codebase, not generic changelog copy.

This file is git-tracked deliberately (unlike `.devin/context/`, which is
entirely gitignored and local-only per checkout) so it survives into a fresh
worktree for the next phase.

## Phase 1: Django — 2026-09-28

- Version: `Django==5.2.17` -> `Django==6.1.1`. No other package bumped —
  `djangorestframework==3.18.1`, `drf-spectacular==0.30.0`, `django-filter==26.1`
  all already claimed/tested Django 6.1 support at their pinned versions
  (verified empirically: schema generation + 291 filter tests, zero changes).
- Deprecation/breaking changes hit in this codebase:
  - `apps/core/management/commands/warm_cache.py:22` — zero-argument
    `select_related()` is deprecated in 6.1. Django's zero-arg
    `select_related()` follows only **non-nullable** forward FK/O2O fields
    (confirmed empirically: bare `select_related()` produces zero JOINs
    here). `Role`'s only forward FK, `deleted_by` (inherited from
    `SoftDeleteModel`), is `null=True` — so the original call was a genuine
    no-op, eager-loading nothing. Fixed by removing the call entirely
    (`Role.objects.all().prefetch_related('permissions')`), which resolves
    the deprecation with zero behavior change.
    **Correction, recorded here for the record:** an earlier draft of this
    fix instead added `select_related('deleted_by')`, on an incorrect claim
    (originating from a task review that was itself wrong, and accepted
    without independent verification at the time) that the bare call had
    been eager-loading `deleted_by`. That "fix" actually introduced a new
    `LEFT OUTER JOIN` to `auth_user` that never existed before — a real,
    if harmless in practice, behavior change beyond the deprecation fix's
    scope (harmless only because `apps.core` is not in `INSTALLED_APPS`,
    so this command is not currently reachable). Caught by the final
    whole-branch review and independently confirmed via
    `Role.objects.select_related().query` vs
    `Role.objects.select_related('deleted_by').query` before merge. Lesson
    for future phases: verify a reviewer's *technical* claim (not just its
    presence) against Django's actual behavior when a fix changes generated
    SQL, especially for a "deprecated API" fix — the deprecation and the
    query-shape claim are separate facts, and getting the second one wrong
    is easy to do under a "just silence the warning" framing.
  - `plugins/notifications/test_push.py:53` — `django.dispatch.Signal.receivers`
    entries changed shape from a 3-tuple `(lookup_key, receiver, is_async)` to
    a 4-tuple `(lookup_key, receiver, sender_ref, is_async)` (undocumented
    internal change, adds a weak sender reference). Only call site in the repo
    that destructures `signal.receivers` positionally; fixed to unpack 4
    values, exact-arity (fails loudly, not silently, if the shape changes
    again).
  - No other check-level, test-level, or migration-level breakage found
    across the entire plugin registry (13 plugins) and every core app audited
    individually in Tasks 4-7 of the implementation plan.
- Pinned-and-deferred: none. Every check-level and test-level issue found had
  a clean, in-scope fix.
- New patterns/gotchas for future phases:
  - **Second pre-existing test failure discovered, unrelated to Django**:
    `plugins.notifications.test_push.LeaveSignalPushTest.test_preference_disables_both_delivery_channels`
    fails on Django 5.2.17 too (verified in an isolated scratch venv) — a
    date-vs-string comparison bug in `plugins/notifications/signals.py`'s
    `pre_save` handler, triggered by `LeaveRequest.save()`'s second internal
    `save(update_fields=['submitted_at'])` re-firing the signal with
    already-typed DB values compared against still-string in-memory values.
    Out of scope for this upgrade (would touch `apps/leave_management`), left
    unfixed, same as the already-known
    `config.test_deployment.ThrottleConfigurationTests.test_cors_credentials_disabled_in_production`.
    **True baseline is 2 known pre-existing failures, not 1.**
  - **`manage.py test` (no args) does not discover `plugins.notifications`
    tests at all** — confirmed by grep on full-suite output: the module never
    appears, even though it runs and fails when targeted explicitly
    (`manage.py test plugins.notifications`). **Root cause identified (found
    by the final whole-branch review, confirmed):** `plugins/notifications/`
    has no `__init__.py` — every sibling plugin does (verified:
    `plugins/analytics/__init__.py` exists, `plugins/notifications/__init__.py`
    does not). Django's default test discovery skips it as a result, along
    with `test_types.py` and `test_viewsets.py` in the same directory. This
    means CI's own backend job (`python manage.py test -v 1` in
    `.github/workflows/ci.yml`) has never exercised any of this plugin's
    tests either — both the `Signal.receivers` fix (Task 7, this phase) and
    the pre-existing `LeaveSignalPushTest` failure above have silently never
    run in CI. Not a Django-6 issue, but adding the missing `__init__.py` as
    a standalone fix will immediately turn CI red on the known
    `LeaveSignalPushTest` failure — so that fix and the `LeaveSignalPushTest`
    bug fix belong in the same follow-up task, not scoped into any upgrade
    phase.
  - **Local dev DB needs a manual plugin-registry sync that nothing in the
    normal setup path calls.** `manage.py ensure_plugins` only creates/applies
    each plugin's own Django app tables — it never populates the `Plugin`
    model's own DB rows (the `plugins_plugin` table), and a freshly created
    `Plugin` row defaults `is_enabled=False`. Only the admin-only `discover`
    API action (`PluginViewSet.discover`, `apps/plugins/viewsets.py:92-119`)
    does this sync. A fresh local checkout's `manage.py runserver` will show
    zero plugins active until either that admin action is called once (via
    the UI) or the equivalent ORM calls are run manually. Not Django-6-related
    — worth a management-command equivalent (e.g. `sync_plugins`) as a
    separate, small task so `docs`/onboarding doesn't have to explain this by
    hand each time.
  - **Plugin URL routing is computed once at Django process startup** —
    toggling a `Plugin.is_enabled` flag in the DB while the dev server is
    already running does not retroactively register that plugin's dynamic
    URLs; a restart is required. Expected Django behavior, not a bug, but
    easy to lose an hour to while doing exactly this kind of manual
    verification.
  - Windows-console-only cosmetic issue: `ensure_plugins`'s
    `self.style.SUCCESS(f'✓ {plugin_name}')` output raises
    `UnicodeEncodeError` on a `cp1252` console (default Windows terminal
    codepage) unless `PYTHONIOENCODING=utf-8` is set. Not Django-6-related,
    not fixed (out of scope), just a known friction point for local Windows
    dev.
- Verification commands that worked (Python 3.12+ required by Django 6;
  this environment used `py -3.14` throughout since no 3.12 launcher was
  available locally — CI itself pins 3.12):
  - `python manage.py check`
  - `python manage.py makemigrations --check --dry-run` (also run scoped:
    `python manage.py makemigrations users --check --dry-run` — the
    `UserTech`/migration-0015 highest-risk check)
  - `python manage.py test -v 1` (full suite; per-cluster during
    implementation: `python manage.py test apps.permissions apps.users
    apps.dashboard apps.reports -v 1`, and similarly per plugin group)
  - `python manage.py spectacular --file <path>.yaml` (drf-spectacular
    schema-generation smoke test)
  - Deployment check (`manage.py check --deploy --settings=config.settings_production`
    with CI's exact env vars) could **not** be completed locally — building
    `psycopg2-binary` from source failed on this Windows/Python-3.14 dev
    environment (no PostgreSQL client dev headers, no prebuilt wheel yet for
    3.14). Confirmed as a local-toolchain gap, not a Django-6 or code issue.
    This check needs to run in CI (Linux/Python 3.12, prebuilt wheels
    available) before this phase is considered fully verified end-to-end.
  - Manual browser verification: seed with `manage.py seed_e2e_data` +
    `manage.py seed_plugin_permissions`, then sync the plugin registry (see
    the gotcha above) before expecting any plugin-gated page to render.

**Residual items carried forward (not blockers, but not fully closed either):**
1. Production deployment check (`--deploy --settings=config.settings_production`)
   needs to actually run once, in CI or a Linux environment, before treating
   the phase as 100% verified — the local attempt was environment-blocked,
   not a pass.
2. nginx-level admin-login rate-limiting was not live-verified (no Docker
   available locally) — the config file itself is confirmed untouched by
   this branch, but the only way to *prove* the live behavior is unaffected
   is a real docker-compose/staging run.
3. The `manage.py test` full-suite discovery gap for `plugins.notifications`
   (see above) is worth its own fix, independent of this upgrade series.
4. A `sync_plugins`-style management command (see above) would close a real
   local-onboarding gap, independent of this upgrade series.
