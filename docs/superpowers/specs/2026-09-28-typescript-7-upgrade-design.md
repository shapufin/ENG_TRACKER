# TypeScript 7 Upgrade (Phase 4) — Design Spec

Part of the 7-phase major-dependency-upgrade series
(`docs/superpowers/specs/2026-09-28-major-dependency-upgrades-design.md`).
Read `docs/superpowers/UPGRADE-JOURNAL.md` (Phases 1-3) before starting.

## Goal

Upgrade `typescript` from `6.0.2` to `7.0.2` for the real build/type-check
pipeline, while keeping `typescript-eslint` (and therefore `npm run lint`)
working unchanged, using the smallest architecture change that satisfies
both.

## The blocker this spec exists to resolve

TypeScript 7.0 (Microsoft's "Project Corsa" Go-ported native compiler,
GA July 2026) ships with **no programmatic/compiler API** — tools that
`require('typescript')` and walk the AST (ESLint's type-aware rules via
`typescript-eslint`, `ts-morph`, etc.) cannot run against it. The stable
API is expected in TypeScript 7.1 (~October 2026 per current community
speculation — not confirmed, not planned around).

Verified directly against the npm registry (not assumed from blog posts):
`typescript-eslint@8.71.0` (latest stable as of this writing) declares
`peerDependencies.typescript: '>=4.8.4 <6.1.0'`. It does not support 7.x
at all, in any published version. A straight version bump to `7.0.2`
breaks `npm run lint` outright.

## Chosen architecture: two-compiler alias (Option B, user-approved)

Microsoft publishes `@typescript/typescript6` — a thin wrapper
(`dependencies: { "@typescript/old": "npm:typescript@^6" }`) that
re-exports the TypeScript 6.x API and ships a `tsc6` binary, specifically
so tools needing the old API can keep using it while `typescript` itself
moves to 7.

The mechanism, verified via a real precedent
(github.com/GemTalk/Jasper/pull/602, "Compile on TypeScript 7, keep TS 6
for eslint") and confirmed against how npm installs aliased packages'
`bin` entries:

- `frontend/package.json`'s `"typescript"` devDependency becomes
  `"npm:@typescript/typescript6@<version>"` instead of a real `typescript`
  version. Every tool that does `require('typescript')` — critically,
  `typescript-eslint`'s parser — resolves to this shim, sees a 6.x API,
  and is satisfied.
- A new devDependency is added, e.g. `"typescript-native":
  "npm:typescript@7.0.2"` (the alias key name is arbitrary — it exists
  purely so the real TS7 package gets installed).
- **No build script changes are needed.** `@typescript/typescript6`'s
  own declared bin is `tsc6` (confirmed via `npm view`), not `tsc` — it
  does not create a `node_modules/.bin/tsc` entry. The real
  `typescript@7.0.2` package (installed under whatever alias key) is
  therefore the *only* package contributing a `tsc` binstub, so the
  existing `"build": "tsc -b && vite build"` script automatically runs
  the real TS7 compiler without modification.
- `npx eslint .` and any type-aware lint rule continues to resolve
  `typescript` to the 6.x-API shim and is unaffected.

**Known residual risk, not eliminated by this design:** type-checking
(`tsc -b`, real TS7) and type-aware linting (`typescript-eslint`, via the
TS6-API shim) now run on two different compiler implementations. A
disagreement between them is possible in principle (e.g. a type
`tsc -b` accepts that the shim's older type-checker would have flagged
differently, or vice versa). Not expected to matter for this codebase in
practice, but worth knowing if a future lint-vs-build discrepancy looks
confusing.

**Exit condition for this workaround** (tracked in the Upgrade Journal,
not solved now): once `typescript-eslint` ships real TypeScript 7
support (expected in a 7.1-compatible release), a follow-up task —
outside this phase — removes the alias, points `"typescript"` straight
at `7.x`, and drops `@typescript/typescript6`.

## Scope

- Bump `typescript` (aliased, see above) 6.0.2 -> 7.0.2.
- Add `@typescript/typescript6` as the `typescript` alias target.
- Audit and fix `tsconfig.json`/`tsconfig.app.json`/`tsconfig.node.json`
  for TS7's breaking config changes: deprecated options (`target: "es5"`,
  `amd`/`umd`/`systemjs`/`none` module formats, `moduleResolution:
  "node"`/`node10`) that were warnings under 6.0 and are hard errors
  under 7.0. This codebase's configs already use `target: "es2023"` and
  `moduleResolution: "bundler"`, so no changes are expected here — this
  audit step exists to confirm that, not because a change is assumed
  needed.
- Specifically check `tsconfig.json`'s existing `"ignoreDeprecations":
  "6.0"` flag — it was presumably added anticipating exactly this
  upgrade. Confirm whether TS7 still recognizes this option or whether
  it's itself now one of the removed/hard-error options; remove or
  update it based on what `tsc -b`'s own output says, not by guessing.
- Fix whatever real type errors `tsc -b` surfaces under the new compiler
  across the whole `frontend/src` tree (unknown count until run — no
  pre-audit script is meaningful here the way the Tailwind class-pattern
  scan was, since this is compiler-behavior-dependent, not a fixed set of
  renamed tokens).
- No other dependency bumped. `typescript-eslint` stays at its current
  pinned version (already TS6-only; no reason to touch it here).

## Non-goals

- Removing the two-compiler alias workaround (tracked as a future
  follow-up once `typescript-eslint` supports TS7).
- Adopting `tsgo`/`@typescript/native-preview` as a separate exploratory
  tool — the real `typescript@7.0.2` package already includes the native
  Go compiler; no separate preview package is needed.
- Restructuring the existing single-project (no project-references)
  `tsc -b` setup — confirmed via `npx tsc -b --dry` that it already
  builds cleanly as one project; out of scope to add composite project
  references now.

## Verification strategy

1. `npx tsc -b` (the real TS7 compiler now) — must succeed with zero
   type errors, fixing whatever it surfaces.
2. `npx eslint .` — must succeed with the same pass/fail profile as
   pre-upgrade (proves the TS6-shim alias is resolving correctly for
   typescript-eslint).
3. `npm run build` (`tsc -b && vite build`) — must succeed end-to-end.
4. Full `npx vitest run` once, at the end — vitest itself doesn't type-
   check (esbuild-transpiled), so this is a behavioral regression check,
   not a type-check substitute.
5. Confirm in the installed `node_modules/.bin/tsc` (or via `npx tsc
   --version`) that the resolved binary genuinely reports `7.0.2`, not
   the 6.x shim — a cheap, concrete check that the alias wiring landed
   the way the design intends, not just that nothing errored.

## Manual checklist — go/no-go vs nice-to-have

**Go/no-go:**
1. `tsc -b` clean on the real TS7 compiler.
2. `npx eslint .` still runs and reports the same baseline
   pass/fail profile as pre-upgrade (not blocked/crashed by the alias).
3. `npm run build` succeeds.
4. Full vitest suite matches the established cross-phase baseline
   (2474 passed / 2 known pre-existing failures / 2476 total).

**Nice-to-have:**
5. Spot-check that VS Code / editor TS tooling still resolves types
   sanely with the aliased `typescript` package (informational only —
   this repo's CI/verification doesn't depend on editor behavior, and a
   editor-side quirk here wouldn't block merge).

## Rollback procedure

Same pattern as prior phases: worktree isolation means an aborted
attempt never touches `main`. If merged but a late problem surfaces:
`git revert -m 1 <merge-commit-sha>` on `main` (never force-push), then
re-open the phase once understood. Re-run `npx tsc -b` and `npx eslint .`
against the reverted `main` to confirm the revert is clean.

## Journal entry template (filled in at completion)

Exact versions + date, the alias wiring's exact `package.json` diff,
every real type error found and how it was fixed (or, if any were
pinned-and-deferred, why), confirmation the resolved `tsc` binary is
genuinely 7.0.2, `eslint`/`vitest`/`build` results, and the "remove this
workaround once typescript-eslint supports TS7" follow-up recorded as an
explicit residual item for a future session to pick up.
