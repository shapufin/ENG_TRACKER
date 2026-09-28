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
    `select_related()` (deprecated in 6.1, implicitly selects all forward
    FK/O2O including nullable ones) was eager-loading `Role`'s inherited
    `deleted_by` FK (from `SoftDeleteModel`). Fixed to
    `select_related('deleted_by')`, explicit. (First fix attempt incorrectly
    removed the call entirely on a wrong claim that `Role` had no forward FK
    — caught by task review, corrected.)
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
    (`manage.py test plugins.notifications`). This means CI's own backend job
    (`python manage.py test -v 1` in `.github/workflows/ci.yml`) has never
    exercised this plugin's tests either — the second pre-existing failure
    above has silently never failed CI. This is a test-discovery
    configuration gap, not a Django-6 issue, and is worth its own
    investigation/fix as a separate task — not scoped into any upgrade phase.
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
