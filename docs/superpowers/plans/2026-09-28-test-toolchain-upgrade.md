# Phase 5 — Test Toolchain + framer-motion Upgrade (Plan)

Design: `docs/superpowers/specs/2026-09-28-test-toolchain-upgrade-design.md`
Series: `docs/superpowers/specs/2026-09-28-major-dependency-upgrades-design.md`

Branch: `upgrade/test-toolchain` (worktree `.worktrees/upgrade-test-toolchain`)

## Global constraints

- **No `git commit` or `git push` without explicit user approval.** This held
  for Phases 1–4 and holds here.
- Bump exactly the five packages in the spec. Do not upgrade RTL,
  `@testing-library/dom`, or vite as collateral.
- `vitest` and `@vitest/coverage-v8` must be the **same exact version**
  (5.0.2). Never let one drift.
- Pin `@testing-library/jest-dom` at **7.0.1**, never 7.0.0.
- Do not consolidate the two vitest configs. Do not touch
  `src/test/setup.ts` or `src/setupTests.ts` unless the upgrade actually
  breaks them — YAGNI, and it would confound the signal.
- Do not reformat `frontend/package.json`; it is deliberately not
  Prettier-clean and that is pre-existing.
- Do not fix the known-stable `PersonalDashboardProgressCard` failure or the
  4 baseline ESLint problems.
- The Phase 4 `tsc` version guard must keep passing; `npm run build` runs it
  first.

## Review focus (what a reviewer should attack)

1. Did the installed tree actually get the intended versions, proven from a
   **deleted `node_modules` + `npm ci`**, not from `package.json`? This is the
   exact failure mode that made Phase 4 a silent no-op.
2. Is `@vitest/coverage-v8` byte-identical in version to `vitest`?
3. Were **both** vitest configs verified, given they load different jest-dom
   entry points?
4. Was any test result that disagreed with baseline re-run idle before being
   accepted, rather than attributed to flake?
5. Did the lockfile diff stay confined to the five packages and their
   transitive closure — no unrelated `@tailwindcss/oxide-wasm32-wasi`
   re-expansion (a known pre-existing drift on `main`)?

## Tasks

### Task 1 — Worktree + baseline confirmation
Create the worktree from current `main`. Run `npm ci`. Confirm the baselines
in the spec still hold on this tree (both vitest configs, eslint, build).
Record actuals in the ledger.
*Escape hatch:* if a baseline disagrees, re-run idle before concluding
anything; only if it reproduces is it a real pre-existing change worth
recording.

### Task 2 — Bump the five packages
Edit `frontend/package.json` to the five target versions, then `npm install`.
Verify from the **installed tree** (`node_modules/<pkg>/package.json`) that
each resolved to the intended version, and that vitest and coverage-v8 match
exactly. Inspect the lockfile diff for unrelated churn and strip known
pre-existing drift if it reappears.
*Escape hatch:* if npm reports a peer conflict, stop and report it rather
than reaching for `--force` or `--legacy-peer-deps`.

### Task 3 — Clean-install verification
Delete `node_modules`, run `npm ci`, and re-verify every version from the
installed tree. This is the load-bearing check for the whole phase.
*Escape hatch:* if `npm ci` disagrees with `npm install`, the lockfile is
wrong — fix the lockfile, do not paper over it.

### Task 4 — Run the suite on both configs
`npx vitest run` and `npx vitest run --config vite.config.ts`, each idle and
in the foreground. Compare against 2475/1/2476.
*Escape hatch:* a worker-timeout-degraded run (fewer than 2476 tests
collected) is void — re-run, do not interpret.

### Task 5 — Fix genuine fallout
Address only failures caused by the upgrade. Expected candidates, in order of
likelihood: tests relying on mock call history accumulating across tests
(`clearMocks` now defaults to true), style assertions affected by jsdom 30
`getComputedStyle` changes, and React unknown-prop warnings from
framer-motion's removed `@emotion/is-prop-valid` filtering.
*Escape hatch:* if the suite matches baseline on both configs, skip this task
with a ledger note. Do not invent work.

### Task 6 — Full verification pass
`npx eslint .`, `npx tsc -b --noEmit`, `npm run build`, and a final clean
`npm ci` + both suites. All must match the spec's success criteria.

### Task 7 — Upgrade Journal entry
Append a Phase 5 entry to `docs/superpowers/UPGRADE-JOURNAL.md`: versions
moved, what actually broke, the dual-config finding, and the measured
pre-flight blast radius (so a future phase does not redo those greps).

### Task 8 — Review and merge
Independent whole-branch review instructed to re-verify from a deleted
`node_modules` rather than trust the docs. Address findings, re-review the fix
diff, then merge `--no-ff` and push — **only after explicit user approval**.
