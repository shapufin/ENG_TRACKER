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
    with CI's exact env vars): initially blocked by `pip install -r
    requirements-production.txt` trying to rebuild `psycopg2-binary` from
    source (no prebuilt wheel yet for Python 3.14 on Windows, no local
    `pg_config`). Root cause was narrower than it first looked: a compatible
    `psycopg2-binary` (2.9.12) was already installed and importable in this
    environment — the failure was `pip` insisting on the exact `==2.9.10` pin
    in `requirements-production.txt` rather than psycopg2 being fundamentally
    unusable here. Installed the remaining production deps
    (`django-redis`, `whitenoise`, `gunicorn`) directly and ran the deploy
    check against the already-present psycopg2 — it completed successfully:
    **zero Django-6-related errors**, only 6 pre-existing `drf-spectacular`
    schema-generation warnings (serializer type-hint gaps in
    `apps/dashboard/serializers.py`, `apps/permissions/serializers.py`,
    `apps/standby/serializers.py`, `apps/users/serializers.py`,
    `apps/users/views/auth.py`, `config/urls.py`) — confirmed via `git log`
    that none of those files are touched by this branch, so the warnings
    predate the Django 6 work entirely and are unrelated. **The production
    settings module and full production dependency set now confirmed to
    load and check cleanly under Django 6.1.1.**
  - Manual browser verification: seed with `manage.py seed_e2e_data` +
    `manage.py seed_plugin_permissions`, then sync the plugin registry (see
    the gotcha above) before expecting any plugin-gated page to render.

**Residual items carried forward (not blockers, but not fully closed either):**
1. nginx-level admin-login rate-limiting was not live-verified (no Docker
   available locally) — the config file itself is confirmed untouched by
   this branch, but the only way to *prove* the live behavior is unaffected
   is a real docker-compose/staging run.
2. The `manage.py test` full-suite discovery gap for `plugins.notifications`
   (see above) is worth its own fix, independent of this upgrade series.
3. A `sync_plugins`-style management command (see above) would close a real
   local-onboarding gap, independent of this upgrade series.
4. `requirements-production.txt`'s exact `psycopg2-binary==2.9.10` pin is
   brittle on Windows/newer-Python dev environments (no prebuilt wheel,
   forces a source build that needs `pg_config`) — worth loosening to a
   compatible range or documenting the local workaround, independent of this
   upgrade series.

**Production deployment check: now fully verified locally** (see above) — the
production settings module and full production dependency set load and pass
`check --deploy` cleanly under Django 6.1.1, zero Django-6-related issues.

## Phase 2: reportlab — 2026-09-28

- Version: `reportlab==4.5.1` -> `reportlab==5.0.1`.
- Usage surface confirmed narrow before touching anything:
  `plugins/analytics/reports.py` (a minimal `canvas.Canvas` stub PDF, no
  tables/images) and `plugins/payroll/services/export_service.py` (the real
  usage — `platypus` `SimpleDocTemplate`/`Table`/`TableStyle`/`Paragraph`/
  `Spacer`/`PageBreak`, `lib.colors`/`units`/`pagesizes`/`styles`, all
  building PDFs from in-memory `BytesIO`/local data, never a remote image
  URL). No other file in the repo imports `reportlab`.
- The only breaking change between 4.x and 5.0 is a security-hardening
  default flip: `rl_config.trustedHosts = None` now means "trust no host"
  for *remote* image fetching (previously meant "trust everything").
  Neither file fetches images from a URL, so this had zero effect here —
  confirmed, not assumed, by grepping both files for `Image(` /
  `ImageReader` (no hits) before starting.
- No code changes required. Bump-only upgrade.
- Verification: `plugins.payroll.tests.test_additional.PayrollAdditionalRegressionTests`
  (13 tests, all 5 PDF-specific ones included) — pass. Full
  `plugins.payroll` + `plugins.analytics` suites (169 tests) — pass. A
  standalone `SimpleDocTemplate`/`Table`/`Paragraph` smoke build via
  `manage.py shell` produced a valid `%PDF`-prefixed document. Full test
  suite: 1770 passed / 1 known pre-existing failure
  (`config.test_deployment...test_cors_credentials_disabled_in_production`,
  documented in Phase 1 above as pre-existing on Django 5.2.17 too and
  unrelated to any upgrade in this series — confirmed again here it also
  fails identically on unmodified `main`, isolated to a test-only assertion
  bug, not reportlab). `manage.py check` — clean.
- Residual items: none new. Same three follow-up items as Phase 1 remain
  open and untouched by this phase (notifications `__init__.py`/test-
  discovery gap, missing `sync_plugins` command, brittle
  `psycopg2-binary==2.9.10` pin).

## Phase 3: Tailwind CSS — 2026-09-28

- Version: `tailwindcss==3.4.17` -> `4.3.3`. Also added
  `@tailwindcss/postcss@4.3.3` and `tw-animate-css@1.4.0`; removed
  `tailwindcss-animate@1.0.7` and `autoprefixer@10.5.2` (v4 prefixes
  internally). `tailwind.config.js` kept as a JS file, loaded via v4's
  `@config` compatibility directive rather than rewritten into native
  `@theme` CSS — deliberate scope decision, not deferred by oversight
  (see spec: `docs/superpowers/specs/2026-09-28-tailwind-4-upgrade-design.md`).
- Spec-audited usage surface (`scripts/tailwind-v4-audit.mjs`, committed,
  re-runnable) across 1205 `frontend/src` files before starting: 32
  `bg-gradient-to-*` hits, 1 `flex-shrink` hit (both breaking, renamed),
  plus visual-risk buckets (bare `border`/`ring`/`shadow-sm`, raw palette
  colors) sized in the spec.
- **Two plan defects found and corrected mid-implementation** (both by an
  implementer escalating instead of guessing, then a controller ruling):
  1. `tailwind.config.js`'s `plugins: [require("tailwindcss-animate")]`
     line threw `MODULE_NOT_FOUND` once the removed package was gone —
     the plan's "leave `tailwind.config.js` untouched" instruction hadn't
     accounted for its own Task 2 removing a package that line
     references. Fixed to `plugins: []` (the replacement needs no JS
     plugin registration) — a narrow required removal, not the `@theme`
     rewrite the plan scopes out.
  2. The plan's own specified CSS import order (`@import "tailwindcss";
     @config ...; @import "tw-animate-css";`) was backwards per
     Tailwind's official docs — `@config` must come AFTER every
     `@import`, not between them. Verified against
     tailwindcss.com/docs/functions-and-directives before ruling (the
     "don't do this" example in Tailwind's own docs is exactly this
     ordering). The fix's first attempt was still incomplete — the
     implementer caught that pre-existing font `@import`s also needed to
     move above `@config`, not just the two new ones — before it converged
     to zero PostCSS warnings.
- Mechanical renames (`bg-gradient-to-*` -> `bg-linear-to-*`,
  `flex-shrink` -> `shrink`): 33 hits across 26 files, audit-script-driven
  and audit-script-verified (0/0 after).
- **Visual regression triage** (the two full `visual-verify.mjs`
  capture/verify runs the spec budgets): 350/492 fingerprints reported
  diffs, but triage found zero real Tailwind-caused regressions —
  - 876/876 `STYLE CHANGED` hits involved an `oklab()`/`oklch()` value,
    but this bucket is actually TWO different things, not one — the
    original version of this entry conflated them:
    - The `/opacity`-utility-driven hits actually inspected (e.g. the
      nav-item `bg-primary/10` background) are v4's
      `color-mix(in oklab, ...)`-based opacity utilities changing how
      the browser *serializes* the computed color, not the rendered
      color itself. Notation-only.
    - The much larger raw-palette-class bucket (615 hits, pre-sized in
      the spec's own audit table) is a genuinely different mechanism:
      Tailwind v4's default color palette itself moved from RGB/HSL to
      OKLCH, which IS a real (if subtle) rendered-color change, not
      just notation. This was always the spec's separately pre-accepted
      "raw-palette-color... check" bucket — still pre-accepted, but for
      a different reason than the opacity-utility hits, and the two
      should not have been described as one uniform "notation change."
  - 662 `MISSING COMPONENT` hits (mostly `button["Notifications"]`)
    traced to `NotificationBell.tsx`'s plugin-slot gating on an async,
    `staleTime: 0` permission query. Live-confirmed the underlying async
    component absence is real (the plugin-injected `AuditLogSidebarItem`
    was genuinely missing on a fresh page load with zero Tailwind
    changes in play) — but the FINAL whole-branch review made a fair
    correction to the mechanism: 264 identical misses of the same
    component across an entire capture run is systematic, not what
    random flakiness looks like. The better-supported explanation,
    given the 429s directly observed in this same session's live
    browser check: the two full `visual-verify` runs' own request
    volume (~832 page loads) exhausted the DRF per-user `1000/hour`
    throttle mid-run, degrading (not randomly flaking) plugin-metadata
    and permission fetches for a real stretch of the capture. Either way
    the conclusion holds (not Tailwind-caused), but the mechanism is a
    genuine lesson for future phases: **`visual-verify`'s own request
    volume can push the app under test into a degraded state
    mid-capture** — a higher test-only DRF throttle, or spacing the two
    full runs further apart, would give cleaner signal next time.
  - 213 `BOUNDS CHANGED` hits, dominated by a uniform 112px sidebar
    shift on `Global Settings`/`Audit Logs` menu items — far too large
    to be a border/ring default-width change (1-3px). The original
    entry's explanation here was internally inconsistent (flagged by
    the final review): `Audit Logs` was itself one of the *shifted*
    items, so it cannot also be the *missing* element that caused its
    own shift. The full diff-report text needed to properly re-derive
    root cause was lost to the process mistake below before this was
    caught. Left genuinely unresolved — most likely the same
    throttle-degradation mechanism as the bucket above (a plugin
    sidebar item rendering in a different loading state between the two
    captures), but this is not independently confirmed the way the
    Notifications trace was.
  - **Process mistake**: a small targeted re-check
    (`--paths=dashboard`) run to test a hypothesis overwrote
    `diff-report.txt` in place before its full context had been read —
    this is also why Bucket 3 above couldn't be fully re-derived.
    Lesson recorded for future phases: copy the report to a separate
    file immediately after any full `verify` run.
- No real border/ring/shadow regressions were found (Buckets 1-3 above),
  so no fix commits were needed for those categories. The final
  whole-branch review DID find one real, unrelated bug the visual-diff
  process structurally could not have caught (see below) — fingerprints
  are captured on pages at rest, not on an open popover, so a popover
  sizing bug was invisible to this entire verification strategy.
- **Final whole-branch review (opus) found one real bug and two
  worthwhile non-blocking fixes**, independent of the visual-diff
  process above:
  - **Bug**: `w-[--radix-popover-trigger-width]` (`HeaderSearch.tsx`,
    `MyClientsSection.tsx`) compiled to invalid CSS under v4 — v4 no
    longer auto-wraps a bare `--custom-property` arbitrary value in
    `var()`, so this produced `width: --radix-popover-trigger-width;`
    (rejected by the browser) instead of the intended trigger-matched
    width, and tailwind-merge silently dropped `popover.tsx`'s `w-72`
    fallback because it still saw a (broken) width utility present.
    Fixed to v4's `w-(--radix-popover-trigger-width)` syntax; added a
    `bracket-css-var-arbitrary-value` pattern to
    `scripts/tailwind-v4-audit.mjs` so future phases catch this
    automatically. Neither the audit script (didn't have the pattern
    yet) nor `visual-verify` could have caught this.
  - **Taken**: v4's Preflight sets `button { cursor: default }`
    (previously an implicit pointer in v3) — the shared `Button`
    primitive had no `cursor-pointer`, so every button app-wide lost its
    hover cursor. Fixed in the one shared primitive. `outline-none` (32
    files) renamed to `outline-hidden` — v4's `outline-none` no longer
    shows in Windows High Contrast Mode; `outline-hidden` restores the
    old behavior, identical in normal rendering.
  - **Explicitly not taken, ruled pre-accepted**: `backdrop-blur-sm`
    (4px->8px default, 14 uses) and `drop-shadow-sm` (1 use) size
    changes — the same class of intentional-default visual drift as the
    already-pre-accepted `shadow-sm` change. Fixing these while leaving
    `shadow-sm` itself unfixed would be an arbitrary inconsistency.
- `tailwindcss-animate` -> `tw-animate-css` swap (8 consuming files —
  `dialog.tsx`, `popover.tsx`, `select.tsx`, `tooltip.tsx`, `checkbox.tsx`,
  `TriStateCheckbox.tsx`, and 2 analytics filter components): verified by
  extracting every animate-related class name the components use
  (`animate-in`/`-out`, `fade-in-0`/`-out-0`, `zoom-in-95`/`-out-95`,
  `slide-in-from-*`/`slide-out-to-*`) and confirming each pattern exists
  in `tw-animate-css@1.4.0`'s actual shipped CSS via direct file read —
  not just trusting the package's "v4-compatible replacement" description.
  `npm run build` succeeded with this swap wired in.
- Verification: `node scripts/tailwind-v4-audit.mjs` — 0 breaking hits.
  `node scripts/modal-audit.mjs` — 1 pre-existing failure
  (`textarea.tsx`'s raw `<textarea>`, confirmed via `git log`/`git diff`
  against `main` to predate this phase entirely, untouched by it — not
  fixed, out of scope). `npm run build` — clean, exit 0. Full
  `npx vitest run` — 2474 passed / 2 failed / 2476 total, matching the
  pre-upgrade baseline's totals exactly; the one *stable* failure
  (`PersonalDashboardProgressCard`) is identical to baseline, and the
  2nd slot's failure differed between runs (`AnimatedNumber`'s
  reduced-motion spring test, confirmed flaky by passing cleanly in
  isolation) — parallel-execution timing noise, not a regression. Net-new
  regressions: zero.
- Final whole-branch review, round 2 (scoped to the fix diff, commits
  `79a4f5c`/`7d4ac6a`/`d9e17f9`): **APPROVED**. Independently re-verified
  all 6 checks (both files use the corrected `w-(--var)` syntax and
  nothing else changed; the audit script's new pattern plus all 4
  existing breaking patterns report 0/0; `button.tsx`'s `cursor-pointer`
  addition is clean; spot-checked the `outline-hidden` rename across
  essentially all 32 files with no stray edits; `npm run build` clean;
  the journal-correction commit is an honest correction, not backfilled
  praise). No further findings. Branch merged to `main` as commit
  `00a50a1` (`git merge --no-ff`) and pushed to `origin/main`. Full
  `npx vitest run` re-confirmed on merged `main` (not just the worktree):
  2474 passed / 2 failed / 2476 total, same two known pre-existing
  failures as the worktree run and the Phase 1/2 baseline — zero net-new
  regressions from the merge itself.
- Residual items carried forward: the same three Phase 1/2 items
  (notifications `__init__.py`, missing `sync_plugins`, brittle
  `psycopg2-binary` pin) plus three new, all explicitly out of scope for
  this phase (not overlooked): native `@theme` CSS migration of
  `tailwind.config.js`; `textarea.tsx`'s pre-existing raw-`<textarea>`
  modal-audit finding; and the 8 `tw-animate-css`-consuming
  dialog/popover/select/tooltip components were verified statically
  (their exact class-name vocabulary confirmed present in the installed
  package's shipped CSS) but never live click-tested end-to-end in this
  phase — the DRF throttle exhaustion from the two full `visual-verify`
  runs blocked that check for the rest of this session. Worth a follow-up
  manual pass once a fresh throttle window is available.

## Phase 4: TypeScript — 2026-09-28

- Version: `typescript==6.0.3` -> `7.0.2`, but not as a plain bump — see
  below. Spec: `docs/superpowers/specs/2026-09-28-typescript-7-upgrade-design.md`.

**The blocker this phase exists to solve:** TypeScript 7.0 (Microsoft's
Go-ported "Project Corsa" native compiler, GA July 2026) ships with no
programmatic/compiler API until 7.1. Verified directly against the npm
registry, not assumed from blog posts: `typescript-eslint@8.71.0` (latest
stable) declares `peerDependencies.typescript: '>=4.8.4 <6.1.0'` — zero
TS7 support in any published version. A plain version bump breaks
`npm run lint` outright. Presented to the user as a genuine fork in the
road (defer the phase / two-compiler workaround / stay on 6.x); user
chose the two-compiler workaround.

**Architecture (two-compiler alias):** `frontend/package.json`'s
`"typescript"` devDependency is now `"npm:@typescript/typescript6@^6.0.2"`
(Microsoft's official TS6-API-compatible shim — it depends on
`@typescript/old`, itself `npm:typescript@^6`, resolved to `6.0.3`). A
second entry, `"@typescript/native": "npm:typescript@7.0.2"`, installs
the real TS7 package, and is what `node_modules/.bin/tsc` must point at.

**The `tsc` bin collision — the subtlest trap in this whole phase.** The
spec originally claimed no build-script change was needed because "the
shim's own binary is named `tsc6`, not `tsc`, so the real TS7 package is
the only one that installs `node_modules/.bin/tsc`." **That is false,
and it silently broke the upgrade.** The shim's hoisted dependency
`@typescript/old` is a real `typescript@6`, which declares *both* `tsc`
and `tsserver` bins — so two packages claim `tsc`. npm resolves that
collision **first-wins by tree order, with no warning whatsoever.**

The original alias key was `"typescript-native"`, which sorts *after*
`@typescript/old`; the 6.x compiler therefore won the binstub. This was
missed because it is install-path dependent: a plain `npm install` onto
an already-populated `node_modules` happened to leave the TS7 binstub in
place and reported `7.0.2`, while a clean `npm ci` — what CI and any
fresh clone does — produced `node_modules/.bin/tsc` -> `@typescript/old`
and reported **`6.0.3`**. Every check still passed; the entire app would
simply have been type-checked on TypeScript 6 forever.

Fixed by renaming the alias key to `"@typescript/native"`, which sorts
*before* `@typescript/old` and so wins the collision — matching the
layout in the upstream precedent this phase was modelled on
([GemTalk/Jasper#602](https://github.com/GemTalk/Jasper/pull/602)),
whose own docs describe the same hazard. Verified by deleting
`node_modules` entirely and re-running both `npm install` and `npm ci`:
both now yield `node_modules/.bin/tsc` -> `@typescript/native/bin/tsc`,
TypeScript `7.0.2`.

**Guard against silent regression (`frontend/scripts/check-tsc-version.mjs`).**
Because the correct resolution rests on npm's undocumented, unwarned
tree-order tie-break, it is one rename or one new dependency away from
silently reverting — with no failing test to catch it. The `build`
script is therefore now
`"node scripts/check-tsc-version.mjs && tsc -b && vite build"`: the guard
resolves which package `node_modules/.bin/tsc` actually execs and fails
the build if it is not TypeScript 7. This is a deliberate, ruled-on
departure from the plan's "no build script changes" constraint — the
constraint was premised on the `tsc6`-bin claim above, which proved
wrong, so the plan's own "that's a plan defect, rule on it" escape
hatch applies.

The guard has to handle **two different binstub layouts**, because npm
exposes a package's bin differently per platform: a generated shim script
that execs the target by relative path (Windows), versus a plain symlink
straight into the owning package (POSIX). A first version only parsed the
shim text; the whole-branch review caught that this fails outright on
Linux, where `readFileSync` follows the symlink and returns TypeScript's
own entry file (`import "../lib/tsc.js";`) — which matches no shim
pattern. That would have broken CI (`ubuntu-latest`) and the
`node:22-slim` Docker build, i.e. the guard would have blocked every
build it was supposed to protect. It now resolves the symlink with
`realpathSync` and walks up to the owning package's `package.json`,
falling back to shim parsing when the binstub is a regular file. Tested
on both platforms in both directions: Windows shim -> TS7 passes / -> TS6
fails, and on real Linux (WSL, genuine symlinks) -> TS7 passes / -> TS6
fails / missing binstub fails cleanly.

**Lockfile correctness.** The lockfile committed alongside the original
alias change still recorded `node_modules/typescript` as the *real*
typescript `6.0.3` rather than the shim — i.e. it did not match
`package.json`, so `npm ci` installed a different tree than `npm install`
did. Regenerated and committed in sync. Note that a plain
`npm install --package-lock-only` on this repo also re-expands six
`@tailwindcss/oxide-wasm32-wasi` bundled-dep entries; that drift is
pre-existing on `main` (reproduced against `main`'s own lockfile in an
isolated temp checkout) and unrelated to this phase, so it was
deliberately excluded to keep the lockfile diff TypeScript-only.

**A note on verification method.** The original Task 2 implementer *and*
its independent reviewer both confirmed `7.0.2` and both were wrong —
they ran `node_modules/.bin/tsc --version` against a tree built by
incremental `npm install`. Two independent confirmations of the same
insufficient check are not two confirmations. Anything that depends on
package *installation* layout must be verified from a deleted
`node_modules` via `npm ci`, not from whatever the working tree happens
to contain. (Use the binstub directly rather than `npx tsc --version`,
which prints garbled output in this environment for reasons not
investigated.)

**Real breaking change found, config-level only:** TypeScript 7 removed
the `baseUrl` compiler option entirely (`TS5102`, hard error — this
codebase's `tsconfig.json` had `"baseUrl": "."`). This was actually
found before any code type-checking could even happen, since `tsc`
can't get past option parsing with an unrecognized option present —
a mid-implementation ruling reordered the plan's Task 3
(fix type errors) to run after this fix rather than before, since the
plan's task numbering couldn't have anticipated which specific option
would block first. Fixed by removing `baseUrl`; the existing
`"paths": {"@/*": ["./src/*"]}` mapping continues to resolve correctly
on its own (verified twice, independently, by the implementer and its
reviewer, each with their own throwaway probe file: a deliberately
type-mismatched import through the `@/` alias correctly triggered a real
`TS2322` error both before and after the `baseUrl` removal — proving the
alias genuinely still resolves and type-checks, not just that `tsc`
didn't crash).

Also removed the pre-existing `"ignoreDeprecations": "6.0"` flag —
empirically confirmed via a before/after `tsc -b` comparison (identical
output either way) that it was already dead weight, not something worth
keeping "just in case."

**Zero real code type errors found.** After the `baseUrl` fix, `tsc -b`
was immediately clean across the entire `frontend/src` tree — TypeScript
7's breaking changes are almost entirely compiler-implementation and
config-level (Go rewrite, removed deprecated options), not new
type-checking rules, so a codebase already on modern explicit compiler
options (`target: es2023`, `moduleResolution: bundler`, no legacy
`amd`/`umd`/`es5`/`node10` settings) saw no real type-error fallout. All
three tsconfig files were audited for other TS7-deprecated-to-error
options; none found beyond `baseUrl`.

**ESLint verified unaffected** at every step: baseline (pre-alias) was
4 problems (2 `react-hooks/set-state-in-effect` errors in
`AdminSidebar.tsx`/`Sidebar.tsx`, 2 React Compiler warnings in
`useSkillsGridVirtualizer.ts`, all pre-existing and unrelated to
TypeScript version) — re-confirmed byte-identical after the alias swap
and again after the tsconfig fixes.

Verification (all re-run after the bin-collision fix, from a deleted
`node_modules`): `npm ci` then `node_modules/.bin/tsc --version` ->
`7.0.2`, binstub confirmed pointing at `@typescript/native`.
`npm run build` — clean, exit 0, guard passing as its first step. Full
`npx vitest run` — 2475 passed / 1 failed / 2476 total, matching the
cross-phase baseline exactly (the one stable
`PersonalDashboardProgressCard` failure; the flaky 2nd slot landed clean
this run, consistent with the pattern documented in Phase 3). Two
environment quirks worth knowing: a backgrounded vitest run's redirected
log came back truncated (8 lines, no summary) despite exit 0, and a
vitest run started immediately after a production build lost ~380 tests
to `[vitest-pool-runner]: Timeout waiting for worker to respond`
worker-startup failures — neither is a real regression, but both look
like one. Re-run in the foreground on an otherwise-idle machine before
believing a vitest result that disagrees with the baseline.

**Residual item, tracked explicitly (this workaround is temporary):**
remove the two-compiler alias once `typescript-eslint` ships real
TypeScript 7 support. Check `npm view typescript-eslint peerDependencies`
at that time — do not assume a specific future version number now
(current community speculation points at a 7.1-compatible release,
unconfirmed). When that lands: point `"typescript"` straight at `7.x`,
drop `@typescript/typescript6`, the `@typescript/native` alias entry,
and `frontend/scripts/check-tsc-version.mjs` (plus its `build`-script
and `check:tsc-version` wiring) — the guard exists only to police the
bin collision the alias layout creates, so it retires with it.
Other residual items carried forward unchanged from Phases 1-3
(notifications `__init__.py`, missing `sync_plugins`, brittle
`psycopg2-binary` pin, native `@theme` CSS migration, `textarea.tsx`
modal-audit finding, the 8 `tw-animate-css` components' pending live
click-test).

## Phase 5: Frontend test toolchain + framer-motion — 2026-09-28

Spec: `docs/superpowers/specs/2026-09-28-test-toolchain-upgrade-design.md`
Plan: `docs/superpowers/plans/2026-09-28-test-toolchain-upgrade.md`

Planned five packages, shipped four:

| Package | From | To |
| --- | --- | --- |
| `vitest` | 4.1.5 | 5.0.2 |
| `@vitest/coverage-v8` | 4.1.9 | 5.0.2 |
| `@testing-library/jest-dom` | 6.9.1 | 7.0.1 |
| `framer-motion` | 12.38.0 | 13.4.5 |
| `jsdom` | 29.1.1 | **deferred, stays 29.1.1** |

**jsdom 30 is blocked by a bug in vitest 5, not by anything in this repo.**
vitest patches jsdom's `URL` to provide `createObjectURL`, and to do that it
sniffs jsdom's private Blob impl symbol via
`Object.getOwnPropertySymbols(Object.getOwnPropertyDescriptors(new window.Blob()))[0]`,
then reads `impl._bytes ?? impl._buffer`. Measured directly: a jsdom 29.1.1
Blob exposes `[ Symbol(impl) ]` with `_bytes`; a jsdom 30.1.1 Blob exposes
**no own symbols at all**, so the sniff yields `undefined` and every
`URL.createObjectURL` call throws
`TypeError: Cannot read properties of undefined (reading '_bytes')`. That was
9 test failures across `exportUtils`, `calendar-export` and
`ImportCredentialsDialog`, all of which vanished on reverting jsdom alone.
vitest 5.0.2 is the newest published release, so there is no fixed version to
move to; revisit when vitest ships one. No loss — jsdom 30's only
maintainer-declared breaking change was a Node engine floor bump.

**This was invisible to dependency research.** Every package checked out fine
in isolation and `vitest` declares `jsdom: "*"`, so no peer range catches it.
Lesson for future phases: a green `npm install` says nothing about runtime
compatibility between a test runner and its environment package — only
running the suite does.

**Real code fallout: exactly one file.** `src/utils/exportUtils.test.tsx`
assigned `globalThis.document = {...}` and `globalThis.URL = {...}` wholesale.
Vitest 5 changed DOM-environment global assignment so it now propagates to the
underlying jsdom window, where `document` is a getter-only property —
`TypeError: Cannot set property document of [object Window] which has only a
getter`. Fixed by switching to `vi.spyOn(document, "createElement")` /
`vi.spyOn(URL, ...)` with an `afterEach` restore, which is already the
convention in `src/lib/calendar-export.test.ts` — no new pattern invented.

**Pre-flight greps paid off; record them so nobody redoes them.** Every
mechanically-detectable vitest 5 breaking change was searched across all 424
test files *before* the bump, and all scored zero: `vi.mock`/`vi.unmock`/
`vi.hoisted` inside a block (now throws at collection), unawaited
`.resolves`/`.rejects` (now fails rather than warns — all 5 usages were
correctly awaited), `.toThrow('')`, `test.sequential`/`describe.sequential`,
the removed `vitest/*` entrypoints, `VITEST_WORKER_ID`/`VITEST_POOL_ID`, and
`@emotion/is-prop-valid`. `clearMocks` flipping to `true` by default touched
nothing despite 1,259 mock usages across 163 files, because `mockClear()`
resets call history only, not implementations.

**framer-motion 12 → 13 required no changes at all.** Its sole documented
breaking change is the removal of the optional `@emotion/is-prop-valid`
dependency; zero references in this codebase. Also worth recording because the
series spec implied otherwise: `framer-motion` is **not** a deprecated shim for
`motion` — the dependency runs the other way (`motion@13.4.5` depends on
`framer-motion@^13.4.5`). No migration to `motion` is needed, now or later.

**Config discovery, deliberately left alone.** The frontend has two vitest
configs that disagree: `vitest.config.ts` (setup `./src/test/setup.ts`, bare
`@testing-library/jest-dom` import, has a `coverage` block) and the `test`
block in `vite.config.ts` (setup `./src/setupTests.ts`, the
`@testing-library/jest-dom/vitest` import, no coverage block). CI runs
`npm test`, which is `vitest --config vite.config.ts`, so **CI uses
`vite.config.ts` and its `--coverage` flag therefore runs on vitest defaults,
ignoring the coverage block that only exists in the other file**. Both were run
to completion and agree (2475/1/2476), so there is no split-brain today, but
every verification in this phase was run against **both** configs precisely
because they load jest-dom two different ways. Consolidating them is a genuine
cleanup and a good candidate for its own change — it was kept out of this phase
so it could not confound the upgrade signal.

Verification (all from a deleted `node_modules` + `npm ci`, per the Phase 4
lesson): installed versions confirmed from `node_modules/<pkg>/package.json`
rather than the manifest — vitest and `@vitest/coverage-v8` both exactly
5.0.2, jest-dom 7.0.1, framer-motion 13.4.5, jsdom 29.1.1, and the Phase 4
alias intact (`typescript` 6.0.2 shim + `@typescript/native` 7.0.2).
`npx vitest run` → 2475 passed / 1 failed / 2476;
`npx vitest run --config vite.config.ts` → same. `npx eslint .` → 4 problems
(2 errors, 2 warnings), exact baseline. `npx tsc -b --noEmit` → exit 0.
`npm run build` → exit 0 with the Phase 4 tsc guard passing first. Coverage
smoke-tested under the CI config — `@vitest/coverage-v8` 5 reports normally.

The known-flaky second slot reappeared once (`AnimatedNumber`, a framer-motion
component — so not assumed to be flake): it passed 3/3 in isolation and the
full suite landed clean on an idle re-run. The documented rule held again —
never interpret a vitest result that disagrees with baseline until it has been
re-run idle in the foreground.

**Residual item added:** raise `jsdom` to 30.x once vitest fixes its Blob impl
sniffing. Other residual items carried forward unchanged from Phases 1-4.

## Phase 6: @tanstack/react-table — 2026-09-30

Spec: `docs/superpowers/specs/2026-09-30-react-table-upgrade-design.md`
Plan: `docs/superpowers/plans/2026-09-30-react-table-upgrade.md`

`@tanstack/react-table` 8.21.3 -> **9.2.4** (npm `latest`). Native v9 API, not
the `useLegacyTable` bridge (which subscribes to full table state and would have
needed a second migration later).

**Sizing was measured before designing.** A probe bump + `tsc -b` gave 96 type
errors in ~40 files, all type-level, and a grep showed exactly **one**
`useReactTable` call (`components/ui/DataTable.tsx`). That is what made a
one-shot mechanical migration safe. Real result: 96 errors -> 0 with two
hand-edited core files plus a scripted rename in 38 consumers.

**Shape of the change**
- New `components/ui/tableTypes.ts`: one module-scope `appFeatures`
  (`tableFeatures({...})`) and the `AppColumnDef` / `AppColumn` / `AppRow` /
  `AppCell` / `AppCellContext` / `AppTable` aliases. Every column file uses these;
  nobody spells `ColumnDef<typeof appFeatures, …>`. (The spec had the aliases in
  `tableColumnHelpers.tsx`; they went in their own file because exporting
  non-components from `DataTable.tsx` trips `react-refresh/only-export-components`
  and `tableColumnHelpers` shouldn't be the type hub.)
- `DataTable`: `useReactTable` -> `useTable({ features: appFeatures, … })`; the
  four `get*RowModel()` options are gone (row models live on `features`).
  `table.getState()` -> `table.state`.
- Consumers: `ColumnDef<T>` -> `AppColumnDef<T>` etc., done by an import-aware
  script (files with a *local* `Row` type, e.g. `Column<Row>`, must not have that
  `Row` renamed — the script only renames identifiers actually imported from
  react-table).

**v9 gotchas hit in this codebase (each was a real compile error)**
- **Features have hard dependencies, enforced in the type system.**
  `globalFilteringFeature` requires `columnFilteringFeature` ("'…' requires '…' to
  be included in this table's features" — error appears as a `never`-style string
  literal, easy to misread as a generic mismatch). `columnDef.size` only exists if
  `columnSizingFeature` is registered — leaving it out silently drops the
  type, not just a warning. `DataTable` uses `size` for header/cell widths.
- `TData` must now `extends RowData` on every generic component/hook that touches
  table types (`DataTable`, `ColumnVisibilityMenu`, all `App*` aliases).
- `VisibilityState` no longer exists -> `ColumnVisibilityState`.
- `initialState.pagination` now requires `pageIndex` as well as `pageSize`.
- `RowSelectionState` is stricter than `Record<string, boolean>`: state hooks
  typed as `Record<string, boolean>` (`useHoursLogPageState`,
  `HoursLogDataTable` props) had to become `RowSelectionState`.
- Annotating a column's `cell: (info: AppCellContext<T, T["status"]>) => …` no
  longer type-checks against the contextual `CellContext<…, unknown>`; drop the
  annotation and cast the value (`leaveColumnsBase.tsx`).
- v9's `useTable` is **React Compiler compatible**, unlike v8's `useReactTable`
  (which needed `// eslint-disable-next-line react-hooks/incompatible-library`).
  Consequence: the directive became "unused" and was removed, and the compiler
  lint now analyzes `DataTable` for the first time, exposing a **pre-existing**
  `react-hooks/set-state-in-effect` (the seed-visibility effect). It was
  suppressed with a one-line justified disable rather than restructured — logic
  changes don't belong in a dependency phase. This is why the eslint baseline
  briefly read 6 problems, not 4.

**`tsc` cannot prove parity for a feature-registration change.** The existing
`DataTable` tests never exercised sorting, global search, pagination, select-all,
or column `size` — precisely the behaviors that silently vanish if a feature is
left out of `tableFeatures`. Added 5 characterization tests
(`describe("table features (react-table 9 parity)")` in `DataTable.test.tsx`);
they assert plain user-visible behavior and pass on v9. (Running them against v8
to prove they're version-independent was attempted but blocked by a sandbox rule,
so that claim is by construction, not measured.) Test baseline is therefore now
**2481 total / 1 failed** (was 2476), the failure being the unchanged
`PersonalDashboardProgressCard` one.

**Not done, deliberately:** no live-app click-through (needs backend + login);
the added tests cover the same interactions at the DOM level. No `table.Subscribe`
/ selector optimization (a perf change, would confound the signal). Tables still
re-render on any table-state change, exactly like v8.

**Flake recurrence:** one full-suite run reported a second failure
(`TicketKPITeamManagementPage` bulk review — a row-selection test, so not
assumed flaky). It passed 3/3 in isolation and the next full run on a fresh
install was clean, both configs. Same rule as before: never interpret a
deviation until re-run idle in the foreground.

Verification (all from `npm ci`, versions read from `node_modules`):
react-table 9.2.4; `npx tsc -b` clean; `npx eslint src` -> 4 problems
(2 errors, 2 warnings), exact baseline; `npx vitest run --config vite.config.ts`
and `--config vitest.config.ts` -> 2480 passed / 1 failed / 2481 each;
`npm run build` exit 0.

**Residual items:** `useTable` selectors / `table.Subscribe` for fine-grained
rendering (optional perf work); `jsdom` 30 still waits on vitest's Blob sniffing
(Phase 5); the pre-existing `set-state-in-effect` in `DataTable` could be
restructured now that it is visible. Others carried forward from Phases 1-5.

## Phase 7: @dagrejs/dagre — 2026-09-30 — DEFERRED (stays 1.1.8)

No code changed. `@dagrejs/dagre` is `^1.1.8`; npm `latest` is 3.1.1. Decision
(with the owner): **do not upgrade**, because v3 changes org-chart layout output
and there is no functional gain to justify that.

**Usage surface:** two call sites, both in `frontend/src/plugins/organigrama/
components/` — `OrgChartPage.tsx` (`layoutTree`: builds the graph, calls
`dagre.layout`, and uses the resulting x/y **directly** for every node) and
`CustomChartViewer.tsx` (`layoutGraph`: dagre pass inside a try/catch, but the
viewer mostly renders stored `position_x`/`position_y`). Only the API
`dagre.graphlib.Graph`, `setGraph({rankdir:"TB",nodesep,ranksep})`,
`setDefaultEdgeLabel`, `setNode`, `setEdge`, `dagre.layout` is used.

**API is not the problem.** All of the above works unchanged in 3.1.1 (verified by
running it); v3 ships its own `.d.ts`, `"type": "module"`, ESM + CJS builds.
Nothing would fail to compile or throw.

**Output is the problem.** Ran identical graphs through 1.1.8 and 3.1.1 in a
scratch directory outside the repo (two isolated `npm i`, a node script
using `createRequire`). Both versions are deterministic run-to-run. Ranks
(y) agree, but **horizontal sibling order differs**: for a root with children
`a, b, c` (insertion order), v1 lays them out left-to-right as `a, b, c`;
v3 gives `c, b, a` (x = 90, 310, 640). v3's ordering follows *edge insertion
order*, and is not affected by node insertion order or by `ranker` /
`disableOptimalOrderHeuristic`. Feeding v3 the edges reversed reproduced v1
exactly on that one example, which looked like a cheap shim — **it is not**:
across 300 seeded random trees/forests/DAGs (2-41 nodes, mixed node sizes) reversed-edge v3
matched v1 on only 93 (31%), un-reversed on 19 (6%). So there is no
compat trick; v3 is simply a different layout, and any "preserve the old
look" work would be a real ordering algorithm (re-sort children to data
order after layout), not a one-liner.

**Why deferring is right:** `OrgChartPage` has no position assertions in its
tests, so nothing in CI would flag the reshuffle — it would ship silently and every
org chart would visibly re-order. v1.1.8 works.

**If revisited:** budget for (1) characterization tests that pin node positions
for a representative tree *before* bumping, (2) a decision on whether sibling
order is semantically meaningful to the org (if it is, preserve it explicitly;
if not, accept v3's layout and record the visual change), (3) re-running the
Organigrama tests. The scratch probe is easy to recreate from the description
above.

**Series outcome:** Phases 1-6 done and merged; Phase 7 deliberately deferred.

## Follow-up: notifications test discovery — 2026-09-30 — RESOLVED

Closes the Phase 1 residual ("notifications `__init__.py` + `LeaveSignalPushTest`",
referenced in the Phase 1, 2, 3 and 4 residual lists above — those mentions are
now stale). Branch `fix/notifications-test-discovery`.

- **`plugins/notifications/__init__.py` added** (empty). Without it the plugin
  was a namespace package: `manage.py test` skipped it, and even
  `manage.py test plugins.notifications` crashed (`__file__` is `None`). CI's
  backend job (`python manage.py test -v 1`) therefore never ran its tests.
  Total discovered tests went **1771 -> 1841** (+70: 69 pre-existing + 1 new).
  Only `plugins/notifications` and `apps/core` lacked `__init__.py`; `apps/core`
  has no tests and is not in `INSTALLED_APPS`, so it was left alone.
- **The `LeaveSignalPushTest` failure was a real double-dispatch bug, not just a
  test-data problem.** `LeaveRequest.save()` saves a new row twice (the second
  only sets `submitted_at`, `update_fields=['submitted_at']`), re-firing
  `pre_save`/`post_save` with `created=False`. On that pass
  `leave_request_notification` compared DB-typed old dates with the instance's
  in-memory dates; if those were strings (tests, or any ORM path that assigns
  strings) it saw a phantom edit and sent a spurious "edited" notification for a
  brand-new request. DRF passes real `date` objects, which is why production
  mostly hid it. Fix: `leave_request_notification` returns early when
  `update_fields` is a subset of `{'submitted_at'}` (the bookkeeping save), which
  fixes the class of problem for any input type without touching
  `apps/leave_management`. Regression test:
  `test_creation_sends_only_the_submitted_notification` (red before, green
  after); the old test now passes too.
- **Environment gotcha:** the default `python` in this checkout is 3.11 with
  Django **5.2.17**; the Django 6 work needs `py -3.14` (Django 6.1.1). Running
  the notifications tests under the wrong interpreter shows a misleading
  `Signal.receivers` unpack error (the 3-vs-4 tuple change from Phase 1).
- **New, unrelated, found while verifying:** two `plugins.tl_scorecard.
  test_tl_scorecard_phase3.EscalationCandidatesServiceTests` tests
  (`test_stale_pending_leave_surfaces_as_candidate`,
  `test_recently_submitted_leave_does_not_escalate`) are **date-dependent**: they
  create leave at `today+10`/`today+11`, and on days where that pair is
  Saturday+Sunday `LeaveRequest.clean()` raises "Leave must include at least one
  business day." Reproduced on unmodified `main` (2026-09-30, a Wednesday, so
  10-11 days out is a weekend). **Fixed afterwards** (`fix/tl-scorecard-date-flake`): a
  `_future_business_days()` helper in the test picks a Mon-Thu start at least 10 days out. **Backend baseline: 1841 tests, 1 known failure
  (`config.test_deployment...test_cors_credentials_disabled_in_production`).**

## Follow-up: CORS credentials test — 2026-09-30 — RESOLVED

`config.test_deployment.ThrottleConfigurationTests.
test_cors_credentials_disabled_in_production` (the long-standing "known
pre-existing failure" from Phase 1) was an **inverted assertion, not a settings
bug**: the docstring says credentials must be `False` and
`config/settings_production.py` sets `CORS_ALLOW_CREDENTIALS = False`, but the
test asserted `assertTrue`. Fixed to `assertFalse`.

Checked before flipping it, since the frontend sets `withCredentials: true` and
the refresh flow uses a `refresh_token` **cookie** (so the old comments' claim
"the SPA uses no cookies" was wrong): production builds use a relative
`VITE_API_URL=/api` proxied same-origin by nginx, so CORS never applies to that
request and `False` is correct hardening. Docstring and settings comment now say
that, and note the invariant: **if the API is ever hosted on a different
origin, `CORS_ALLOW_CREDENTIALS` must be revisited** (the refresh cookie would
then need credentials).

**Backend baseline is now fully green: 1841 tests, 0 failures.**

## Follow-up: vitest config consolidation — 2026-09-30 — RESOLVED

Closes the Phase 5 "config discovery" residual. The frontend had two vitest
configs that disagreed; CI (`npm test` = `vitest --config vite.config.ts`) used
one while a bare `npx vitest` silently used the other (vitest prefers
`vitest.config.ts`). Now there is **one**: the `test` block in `vite.config.ts`.

- Moved the `coverage` block (v8; reporters `text`, `json`, `lcov`;
  `reportsDirectory ./coverage`; excludes) into `vite.config.ts` and added
  `node_modules/**` + `dist/**` to `exclude`. Before this, CI's `--coverage` ran
  on vitest defaults and the real coverage settings were dead code. Kept the
  `json` reporter deliberately: the CI fallow step reads
  `coverage/coverage-final.json`.
- Deleted `frontend/vitest.config.ts` and `frontend/src/test/setup.ts` (its bare
  `@testing-library/jest-dom` import is superseded by
  `src/setupTests.ts`'s `@testing-library/jest-dom/vitest`, which is what CI
  always used). `src/test/hookTestUtils.tsx` stays. Nothing else referenced
  either deleted file.
- Verified with the exact CI command: full `npm test -- --run --coverage` gives
  2480 passed / 1 failed / 2481 (the known `PersonalDashboardProgressCard`
  failure); on a passing subset `coverage-final.json` and `lcov.info` are
  produced, 30 source files, zero test/setup files included. A bare
  `npx vitest run` now resolves to `vite.config.ts`.
- **CI gotcha to know about:** vitest does not write the coverage report when
  any test fails (`coverage.reportOnFailure` defaults to false), so with a red
  test there is no `coverage-final.json` and the fallow step that follows has
  nothing to read. Locally the known `PersonalDashboardProgressCard` failure
  triggers exactly this. Not changed here (setting `reportOnFailure` is a policy
  choice); the earlier "verify both configs" instruction in this journal no
  longer applies.

## Follow-up: `sync_plugins` management command — 2026-09-30 — RESOLVED

Closes the Phase 1 "local dev DB needs a manual plugin-registry sync" gap.
`python manage.py sync_plugins` now does from the CLI what the admin-only
`discover` API action did: re-discovers plugins and creates/updates their
`Plugin` rows. It **never sets `is_enabled`** (new rows are disabled) — enabling
stays an explicit action (`activate_plugin`, or the admin UI toggle). Still
required after enabling: restart the server, since plugin URLs are computed at
process startup.

- Logic lives once in `apps/plugins/services/registry_sync.py`
  (`sync_plugin_registry()`); the `discover` action and the command both call it
  (the action's inline copy was removed, behavior unchanged, `apps.plugins`
  tests still green).
- Tests: `apps/plugins/test_sync_plugins.py` (creates a disabled row per
  discovered plugin, idempotent, preserves `is_enabled`, refreshes stale
  metadata, command output). Backend baseline: **1844 tests, 0 failures**.
- `ensure_plugins` (creates each plugin's own tables) is unchanged and separate;
  a fresh checkout needs both, tables first.
- Scan note: besides the now-fixed `plugins/notifications`, these directories
  still have no `__init__.py` — `apps/core`, `apps/core/management/commands`,
  `apps/plugins/services`, `core/middleware`, `core/plugins` — but none contains
  tests, so they are not a CI blind spot (they work as namespace packages).
