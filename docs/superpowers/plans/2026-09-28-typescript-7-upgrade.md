# TypeScript 7 Upgrade (Phase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `typescript` to `7.0.2` for the real build/type-check
pipeline via the two-compiler alias workaround, keeping `typescript-eslint`
and `npm run lint` working unchanged, with zero new real type errors left
unfixed.

**Architecture:** `package.json`'s `"typescript"` devDependency becomes an
npm alias to `@typescript/typescript6` (a TS6-API-compatible shim,
satisfying `typescript-eslint`'s `require('typescript')` resolution); a new
alias entry installs the real `typescript@7.0.2` package, whose own `tsc`
binstub becomes the only one in `node_modules/.bin` (the shim's bin is
`tsc6`, not `tsc`) — so the existing `tsc -b && vite build` script needs no
changes and automatically runs on the real TS7 compiler.

**Tech Stack:** TypeScript 7 (Go-native compiler), typescript-eslint 8.x
(TS6-API-only), Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-28-typescript-7-upgrade-design.md`

## Global Constraints

- Only `typescript`'s resolution changes (via the alias). No other
  package bumped — `typescript-eslint` stays exactly pinned.
- No build script changes (`package.json`'s `"build"`/`"lint"` scripts
  stay byte-identical) — the whole point of the bin-name non-collision
  is that this isn't necessary; if a task finds it IS necessary, that's
  a plan defect, rule on it rather than forcing it through.
- Fix real type errors `tsc -b` surfaces with the smallest viable
  change per error — never widen a type to `any`/`unknown` to silence an
  error unless the underlying code is genuinely untypeable that way (and
  say so if it comes up).
- Full `npx vitest run` exactly once, at the end, after all fixes.

## Review Focus

1. The alias wiring resolving backwards — `typescript-eslint` accidentally
   getting the real TS7 package (and failing to parse) instead of the
   shim, or `tsc -b` accidentally resolving to the TS6 shim's underlying
   6.x compiler instead of real 7.0.2 — silently passing lint/build with
   the WRONG compiler under each, defeating the whole point of this
   phase. (`Task 2`'s own verification step is the test for this.)
2. A real type error fixed by loosening a type (`any`, a non-null
   assertion papering over a real possible-null case, a broad `@ts-ignore`)
   rather than fixing the actual type mismatch — this compiler swap is
   not lib.d.ts churn requiring type-hierarchy rewrites, so a widened
   type is a red flag, not an expected cost. (`Task 3`)
3. `tsconfig.json`'s existing `"ignoreDeprecations": "6.0"` being left in
   place unexamined when it may now be a recognized-but-meaningless
   leftover, or (less likely but worth checking) an unrecognized option
   TS7 rejects outright. (`Task 4`)
4. `npx eslint .`'s pass/fail profile silently changing (new errors, or
   suspiciously fewer) after the alias swap — a sign type-aware rules
   are resolving against a different/broken TS6 API surface, not
   evidence everything's fine. (`Task 5`)
5. The `node_modules/.bin/tsc` resolved binary NOT actually reporting
   `7.0.2` after the whole exercise — passing tests while accidentally
   never running the real upgrade at all. (`Task 2`'s verification, and
   re-confirmed in `Task 6`.)

---

### Task 1: Pre-upgrade baseline (no code changes)

**Files:** none modified.

- [ ] **Step 1: Record the pre-upgrade vitest baseline**

Run: `cd frontend && npx vitest run` (full run). Record exact pass/fail/
skip counts — expect to match the established cross-phase baseline
(2474 passed / 2 known pre-existing failures / 2476 total); if it
doesn't, note the discrepancy rather than assuming it's this phase's
fault (nothing has changed yet).

- [ ] **Step 2: Record the pre-upgrade `tsc -b` and `eslint` baseline**

Run: `cd frontend && npx tsc -b` (expect clean, TS6.0.2) and
`npx eslint .` (record exact pass/fail counts/error list if any exist
today — this is the profile Task 5 must match after the alias swap).

- [ ] **Step 3: Confirm current resolved TypeScript version**

Run: `cd frontend && npx tsc --version` — record it (expect `6.0.2`),
this is the "before" for Task 2's "after" check.

No commit — this task changes no tracked files.

---

### Task 2: Wire the two-compiler alias

**Files:**
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: `typescript` resolving to the TS6-API shim; a new alias
  entry resolving to the real TS7 package; `node_modules/.bin/tsc`
  provided only by the real TS7 package.

- [ ] **Step 1: Change `package.json`'s `typescript` devDependency**

From `"typescript": "~6.0.2"` to `"typescript": "npm:@typescript/typescript6@^6.0.2"`
(pin to the shim's latest version compatible with `^6.0.2` — check
`npm view @typescript/typescript6 versions` for the actual available
range at implementation time, since the exact shim version available
may differ from what the spec assumed).

- [ ] **Step 2: Add a new devDependency for the real TS7 compiler**

Add `"typescript-native": "npm:typescript@7.0.2"` (the key name is
arbitrary — it exists only so npm installs the real package and its
`tsc`/`tsserver` binstubs).

- [ ] **Step 3: Install and verify the bin resolution**

Run `npm install` in `frontend/`. Then run `npx tsc --version` — MUST
report `7.0.2`, not `6.0.2`. If it reports the wrong version, STOP —
this is Review Focus #1/#5, do not proceed until resolved (check for a
stale `node_modules/.bin/tsc` symlink from before the alias change;
a clean `rm -rf node_modules && npm install` may be needed).

- [ ] **Step 4: Verify typescript-eslint still resolves the TS6 API**

Run `npx eslint . --max-warnings=0` is NOT required to pass yet (Task 5
owns actually fixing lint output) — this step only confirms ESLint
doesn't crash with a "TypeScript version not supported" error or a
module-resolution crash. A crash here means the alias resolved
backwards (Review Focus #1) — STOP and escalate rather than guessing.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: alias typescript to the TS6-API shim, bump the real compiler to 7.0.2"
```

---

### Task 3: Fix real type errors under TS7

**Files:** determined by `tsc -b`'s actual output — unknowable ahead of
time, unlike the Tailwind phase's fixed class-rename list, since this
depends on compiler-implementation behavior, not a documented list of
renamed tokens.

**Interfaces:**
- Consumes: Task 2's working TS7 resolution.
- Produces: `tsc -b` exits 0 with zero errors.

- [ ] **Step 1: Run `tsc -b` and collect every reported error**

Run: `cd frontend && npx tsc -b` (or `npx tsc -b --force` if incremental
build info from the old compiler causes stale-cache confusion — TS7's
build info format may differ from 6.x's).

- [ ] **Step 2: Fix each error with the smallest viable, correctly-typed change**

Per Review Focus #2: fix the actual type mismatch. Do not silence an
error with `any`/`@ts-ignore`/a non-null assertion unless the
underlying value is genuinely proven safe and the reason is written
inline as a comment. If more than a small number of errors turn out to
require real design judgment (not mechanical type fixes), stop and
report — that's a signal this task may need to split.

- [ ] **Step 3: Re-run `tsc -b` until it exits 0**

- [ ] **Step 4: Run the touched files' own vitest tests (not the full suite)**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: resolve TypeScript 7 type-check errors"
```

If Step 1 finds zero errors, mark this task complete with a ledger note
"tsc -b was already clean under TS7, no fixes needed" and skip the rest.

---

### Task 4: Audit and resolve `ignoreDeprecations` and other config flags

**Files:**
- Modify (if needed): `frontend/tsconfig.json`, possibly
  `tsconfig.app.json`/`tsconfig.node.json`

- [ ] **Step 1: Check whether `tsconfig.json`'s `"ignoreDeprecations": "6.0"` still does anything under TS7**

Run `tsc -b` with and without the flag (temporarily comment it out,
re-run, compare output) to see whether removing it changes anything. If
TS7 emits an "unknown compiler option" or "unrecognized value" warning/
error for it, that's decisive; if it emits nothing either way, the flag
is dead weight from the version it was aimed at (6.0) and should be
removed for clarity, not left as confusing leftover configuration.

- [ ] **Step 2: Audit all three tsconfig files for other TS7-deprecated-to-error options**

Specifically check for `target: "es5"` (dropped entirely in TS7),
`module`/`moduleResolution` values in `amd`/`umd`/`systemjs`/`none`/
`node`/`node10` (all now hard errors) — this codebase's configs already
use `es2023`/`esnext`/`bundler` per the spec's pre-check, so this step
is expected to find nothing, but must actually check `tsc -b`'s output
rather than assume based on the spec's prediction.

- [ ] **Step 3: Apply whatever change Steps 1-2 concluded (removal, or confirmed no-op-but-keep, or a real fix)**

- [ ] **Step 4: Re-run `tsc -b`, confirm still clean**

- [ ] **Step 5: Commit** (or, if Steps 1-2 found nothing to change, mark
  complete with a ledger note and skip the commit)

```bash
git add frontend/tsconfig.json
git commit -m "chore: remove/update TS7-obsolete tsconfig deprecation flag"
```

---

### Task 5: Verify ESLint's baseline is unchanged

**Files:** none modified, unless Task 1's baseline had zero lint errors
and this task finds new ones (see Step 3).

- [ ] **Step 1: Run `npx eslint .` from `frontend/`**

- [ ] **Step 2: Compare against Task 1's recorded baseline**

Same pass/fail profile (same error count, same files, same rules) means
the TS6-API-shim alias is resolving correctly for type-aware lint rules.

- [ ] **Step 3: If the profile changed, diagnose before fixing anything**

A new lint error post-alias-swap is Review Focus #4 — determine whether
it's a genuine, correct finding from the (still TS6-based) linter that
happens to newly apply because of a Task 3 code change, versus a sign
the shim isn't resolving cleanly. If it's a genuine finding tied to a
Task 3 fix, fix it there (or note it in that task's ledger entry). If
the lint tool itself seems to be misbehaving, STOP and escalate — this
is Review Focus #1 territory.

- [ ] **Step 4: Record the final comparison in the ledger** (no commit
  needed unless Step 3 required a code fix, in which case fold it into
  a small fix commit)

---

### Task 6: Final verification pass

**Files:** none modified (verification only).

- [ ] **Step 1: Confirm the resolved compiler version one more time**

Run: `npx tsc --version` — must report `7.0.2`.

- [ ] **Step 2: `npm run build` (the real `tsc -b && vite build` script, unmodified)**

Must succeed end-to-end — this is the definitive proof the alias needed
no build-script changes, not just a theory.

- [ ] **Step 3: Full `npx vitest run` once**

Compare against Task 1's baseline — must match or exceed it (no new
failures).

- [ ] **Step 4: Record all results in the ledger**

---

### Task 7: Upgrade Journal entry

**Files:**
- Modify: `docs/superpowers/UPGRADE-JOURNAL.md`

- [ ] **Step 1: Add the Phase 4 entry**

Follow the existing entry format: exact versions + date, the alias
wiring's exact effect, every real type error found and how it was fixed
(or explicitly note "none found"), the `ignoreDeprecations` finding,
confirmation the resolved binary is genuinely `7.0.2`,
`eslint`/`vitest`/`build` results, and an explicit residual item: this
workaround should be removed once `typescript-eslint` ships real
TypeScript 7 support (check `npm view typescript-eslint peerDependencies`
at that time — do not assume a specific future version number now).

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/UPGRADE-JOURNAL.md
git commit -m "docs: add Phase 4 (TypeScript 7) entry to the Upgrade Journal"
```

---

### Task 8: Present the whole-branch diff for final review

- [ ] **Step 1: Generate the full branch diff against `main`**

- [ ] **Step 2: Dispatch the final whole-branch code review** (most
  capable available model) — focus it on the Review Focus list above,
  and specifically ask it to independently re-verify the resolved `tsc`
  version and re-run `eslint`/`build` itself rather than trust the
  ledger.

- [ ] **Step 3: Address any findings, re-review the fix diff only**

- [ ] **Step 4: Report completion, ready for merge**
