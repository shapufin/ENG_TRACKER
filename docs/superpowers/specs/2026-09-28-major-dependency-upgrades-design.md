# Major Dependency Upgrades — Phased Migration

Date: 2026-09-28

## Purpose

Upgrade seven major-version dependency jumps across the stack, one
phase at a time, each fully tested and merged to `main` before the
next phase starts. No phase bumps a dependency it isn't scoped to,
and no phase starts until the prior one is green and merged.

Target versions:

| Dependency | From | To |
|---|---|---|
| Django | 5.2.17 | 6.1.1 |
| reportlab | 4.5.1 | 5.0.1 |
| tailwindcss | 3.4.17 | 4.3.3 |
| typescript | 6.0.3 | 7.0.2 |
| framer-motion | 12.38.0 | 13.x |
| vitest | 4.1.5 | 5.x |
| @vitest/coverage-v8 | 4.1.9 | 5.x |
| jsdom | 29.1.1 | 30.x |
| @testing-library/jest-dom | 6.9.1 | 7.x |
| @tanstack/react-table | 8.21.3 | 9.x |
| @dagrejs/dagre | 1.1.8 | 3.x |

Phase order (each is its own branch, its own review, its own merge):

1. **Django 6** (+ DRF 3.18.1 / drf-spectacular 0.30.0 / django-filter
   26.1 compatibility-verified, not bumped, and the full plugin
   registry audited)
2. **reportlab 5** (PDF evidence exports: `pdfExport.ts` client side,
   any server-side reportlab usage)
3. **Tailwind 4** (full config-format rewrite, touches every styled
   component)
4. **TypeScript 7** (compiler bump, whole-codebase type-check)
5. **Animation + test toolchain**: framer-motion 13, vitest 5,
   @vitest/coverage-v8 5, jsdom 30, @testing-library/jest-dom 7 (one
   phase — these are interdependent: vitest/coverage-v8/jsdom/jest-dom
   all move together as one test-runner stack, framer-motion rides
   alongside since `lib/motion.ts` is exercised by the same test
   suite this phase re-validates)
6. **react-table 9** (data-table consumers app-wide)
7. **dagre 3** (Organigrama plugin chart layout only) — DEFERRED, see Upgrade Journal Phase 7 (v3 changes sibling order)

## Why this order

Django is the deepest dependency (everything else in the backend sits
on it) and the highest blast-radius if it breaks silently, so it goes
first while attention is freshest. reportlab follows because it's the
smallest, most isolated backend dependency — a good "prove the
per-phase process works" second phase before tackling the much larger
frontend phases. Tailwind and TypeScript are whole-codebase but
mechanical; the test-toolchain phase deliberately comes after them so
the upgraded test runner is validated against already-upgraded
component/type code, not against code that's about to change again.
react-table and dagre are last because they're the most narrowly
scoped (one cross-cutting UI primitive, one single-plugin dependency)
and least likely to interact with anything upstream.

**Ordering constraints between phases 2-7:** Phase 4 (TypeScript 7)
must complete before Phase 5 (test toolchain) and Phase 6
(react-table 9), since both consume updated type definitions and a
stale compiler would mask type errors the later phase needs to see
cleanly. Phase 7 (dagre 3) has no dependency on any other phase — it's
isolated to the Organigrama plugin's chart layout — and could
technically run any time after Phase 1, but stays last for
consistency with the rest of this plan. Phase 2 (reportlab) and
Phase 3 (Tailwind) are independent of everything else, including each
other, and could be freely swapped or interleaved with Phase 4+ if a
reason comes up later; nothing downstream assumes they ran in this
specific slot. The only hard constraint in the whole sequence is
Phase 1 (Django) first and Phase 4 before Phase 5/6.

## Environment and validation reality

- No staging environment or CI-as-primary-gate: validation is local
  (`python manage.py test`, `npx vitest run`, manual browser
  verification via `runserver` + `npm run dev`).
- CI (`.github/workflows/ci.yml`) already runs on every push to
  `main`/`master` and PRs against them: ruff, `manage.py check`,
  migration-drift check, `check --deploy`, full Django test suite,
  pip-audit, bandit, Docker build (backend+frontend) on the backend
  side; npm audit, the plugin-service-URL guard, Prettier, ESLint,
  `tsc -b --noEmit`, build, vitest+coverage, fallow health/dead-code
  on the frontend side. This is a safety net that runs automatically
  once a branch is pushed and a PR opened — it is not the primary
  gate, since work happens on a branch that isn't pushed until each
  phase is already locally green.
- Test coverage is substantial: ~80 backend `test_*.py` files across
  every app and plugin, ~100+ frontend `*.test.ts(x)` files. A green
  full-suite run is trustworthy signal, not a rubber stamp.
- Rollback stance per phase: work on a dedicated branch
  (`upgrade/<dependency>-<major>`), never touch `main` mid-phase. If a
  specific breaking change is too deep to fix cleanly within the
  phase, pin the dependency just below the new major, document why in
  the Upgrade Journal (see below), and move on rather than blocking
  the whole phase indefinitely.

## Phase template (applies to every phase)

1. Branch off `main`: `upgrade/<dependency>-<major>`.
2. Read the dependency's official upgrade/deprecation guide for the
   exact version jump (via Context7 for current docs, not training
   data — these are 2026-era releases).
3. Read the current Upgrade Journal (`docs/superpowers/UPGRADE-
   JOURNAL.md`) for anything a prior phase already learned that's
   relevant.
4. Bump the version in `requirements.txt` / `package.json`.
5. Run the cheapest breakage-surfacing command first (`manage.py
   check`, `tsc -b --noEmit`, `npm run build`) before running the full
   test suite — fail fast on obvious breaks.
6. Fix deprecations/breaking API changes with the smallest viable
   diff. No unrelated refactors, no speculative future-proofing.
7. Run targeted tests for whatever was touched, then the entire
   relevant suite (backend: `python manage.py test -v 1`; frontend:
   `npx vitest run --coverage`) exactly once at the end.
8. Manual browser verification (via the browser pane, `preview_start`)
   of the golden paths this phase's change actually affects — not a
   full app walkthrough every phase, scoped to what could plausibly
   break.
9. Update the Upgrade Journal using this exact template per entry:

   ```
   ## Phase <N>: <dependency> — <date completed>

   - Version: <package>==<old> -> <package>==<new> (repeat per package
     touched in this phase, e.g. Django, plus any forced-compatible
     bump like DRF)
   - Deprecation/breaking changes hit in this codebase: <specifics,
     not changelog copy — file/symbol names>
   - Pinned-and-deferred (if any): <package>==<version pinned at> —
     <why, and what a future attempt needs to resolve>
   - New patterns/gotchas for future phases: <...>
   - Verification commands that worked: <exact commands>
   ```

   Recording exact before/after versions and the date inline means a
   future read of the journal doesn't require reconstructing the bump
   from `git blame` on `requirements.txt`/`package.json`.
10. Present the diff for review. Only after explicit approval: merge
    to `main`. Next phase starts fresh from updated `main`.

**If something breaks in production after a phase has already merged**
(not caught by local verification or CI): revert the merge commit on
`main`, restore the pre-phase pinned versions in
`requirements.txt`/`package.json`, and amend that phase's Upgrade
Journal entry with a "Reverted — <date>, <reason>" line rather than
deleting the entry (the failed attempt is itself useful information
for the retry). Re-attempt the phase as a new branch once the
production-only failure mode is understood — don't just re-merge the
same branch.

## Phase 1 detail: Django 5.2.17 → 6.1.1

Broadened scope per explicit decision: this phase audits the full
plugin system, not a sample.

**Plugins/apps audited individually** (own test file(s) run first,
in isolation, before the full suite — fast signal on which plugin
broke): `analytics`, `audit_log`, `control_room`, `data_import`,
`engagement`, `notifications`, `onboarding`, `organigrama`, `payroll`,
`site_backup`, `skills`, `ticket_kpi`, `tl_scorecard`, plus core apps
`permissions`, `users`, `dashboard`, `reports`.

**Specific risk areas in this codebase** (from CLAUDE.md Hot
Invariants, not generic Django-6 changelog items):

- Plugin registry's dynamic app-loading and `injection_slots`
  mechanism (`plugin.py` per plugin) — confirm `get_frontend_metadata()`
  still resolves after the bump.
- `except ImportError:`-only fail-closed pattern for optional-plugin
  imports (`core/mixins/permissions.py`, `apps/reports/viewsets.py`) —
  confirm Django 6 doesn't change import machinery in a way that
  turns an `ImportError` into some other exception type.
- `CacheInvalidationMixin` / `CacheKey.dashboard_reference` /
  `build_query_fingerprint` reference-table caching pattern
  (`core/utils/cache.py`) — confirm cache framework API compatibility.
- `MonthlyLockMixin` (OT/standby monthly lock) — confirm any Django
  ORM/queryset methods it relies on for past-month blocking aren't
  deprecated/removed.
- `UserTech` M2M-through model, deliberately not inheriting
  `BaseModel`, with migration `0015` as a zero-op
  `SeparateDatabaseAndState` — confirm the migration-drift CI check
  and `makemigrations --check --dry-run` still see zero drift after
  the bump (this is the single highest-risk migration in the repo:
  regenerating it would attempt to CREATE a table that already
  exists).
- `PayrollRunViewSet`'s run-level vs. line-level scoping
  (`_allowed_payroll_user_ids`, `_scoped_lines`, `_ensure_unrestricted`)
  — confirm queryset scoping behavior is unchanged (this was a real
  IDOR fix; don't want an upgrade to silently reopen it).
- Admin routing (nginx-proxied `/admin/`, `/static/`,
  rate-limited `/admin/login/`) — not a Django-6 concern per se, but
  the admin panel is the single most recently-fragile surface in this
  repo (two real production bugs fixed 2026-09-27/28), so it gets an
  explicit manual check even though the fix lives in nginx, not
  Django.
- DRF 3.18.1 / drf-spectacular 0.30.0 / django-filter 26.1 —
  compatibility-verified against Django 6, version bumped only if
  Django 6 forces it (e.g., a hard version floor in DRF's own
  `setup.py`).

**Verification for this phase:**

- `python manage.py check`
- `python manage.py makemigrations --check --dry-run`
- `python manage.py test -v 1` (full suite)
- `python manage.py check --deploy --settings=config.settings_production`
  (matching CI's env vars)
- Manual, via browser pane, ordered by blast radius — **go/no-go**
  items block the merge on failure, **nice-to-have** items get a
  journal note but don't block:
  - **Go/no-go:** login works at all; admin panel reachable
    (`/admin/`, static assets load, login rate-limit still enforced);
    TL-scoped payroll run still shows only that TL's team's lines
    (`_scoped_lines`/`_ensure_unrestricted` — this is the IDOR fix,
    a regression here is a security bug, not a UI bug); one
    plugin-gated page loads for a non-admin role (proves the plugin
    registry still resolves post-bump).
  - **Nice-to-have:** one payroll export (Excel + PDF) renders
    correctly; one calendar view loads and displays events. A failure
    here gets logged in the Upgrade Journal and fixed before merge if
    cheap, otherwise tracked as a known issue for immediate
    follow-up — it does not by itself block the phase.

**Definition of done:** full backend suite green, `requirements.txt`
updated, Upgrade Journal entry written, no plugin's registration
broken, migration-drift check clean, manual checklist above passed,
diff reviewed and approved, merged to `main`.

## Later phases (summarized, detailed at their own start)

Phases 2-7 follow the Phase Template above. Each phase's own detail
section (risk areas specific to that dependency, exact verification
commands, definition of done) gets written and reviewed at the start
of that phase — not speculated now, since Phase 1's findings (recorded
in the Upgrade Journal) may change what matters for later phases
(e.g., if Django 6 changes template rendering in a way that affects
how Tailwind's phase should be scoped).

## Cross-phase memory

Two mechanisms, different lifetimes:

1. **`docs/superpowers/UPGRADE-JOURNAL.md`** (git-tracked, in-repo,
   team-visible): one section per completed phase. Added to
   CLAUDE.md's Task Router, keyed on "upgrade, major version,
   dependency bump", so any future session (mine, a teammate's, or a
   different AI tool's) reads it before starting a subsequent phase.
   (Originally planned for `.devin/context/13-UPGRADE-JOURNAL.md`, but
   that whole directory turned out to be entirely gitignored — local-only,
   never shared — so the journal was moved here during Phase 1, before
   any entry was written. This is the single source of truth for
   per-phase completion status; this spec document itself is static and
   does not track live status.)
2. **Claude's own persistent project memory** (this assistant's
   cross-session memory, not repo-tracked): tracks current phase,
   what's done, what's next, any active pin-and-defer — so if this
   work spans multiple chat sessions, state doesn't need to be
   re-explained.

No separate non-repo scratch log — the journal is written only once a
phase is actually complete and merged, so there's no need for a
pre-final draft tier.

## Testing strategy

TDD applies where this phase *adds* code (e.g., a workaround for a
removed API). Where it's purely a version bump plus fixing what breaks,
the existing test suite is the spec — the definition of "done" is the
existing suite passing again, not new tests being written for their
own sake. New regression tests are added only if a fix reveals a gap
the existing suite should have caught but didn't.

## Error handling / risk notes

- If a breaking change is found with no clean fix within scope: pin
  just below the target major, document in the Upgrade Journal with
  the specific error/incompatibility and what a future attempt would
  need to resolve it, and continue the phase with the rest of the
  bump.
- If plugin registry audit finds a plugin broken by the Django bump in
  a way that reveals a deeper design issue (not just a deprecated
  call): flag it, do not silently fix it inside the upgrade phase —
  surface it for a decision, since scope creep here defeats the
  purpose of doing phases one at a time.
