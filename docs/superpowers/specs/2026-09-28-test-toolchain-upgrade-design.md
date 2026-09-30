# Phase 5 — Frontend Test Toolchain + framer-motion Major Upgrade (Design)

Part of the 7-phase series in
`docs/superpowers/specs/2026-09-28-major-dependency-upgrades-design.md`.

**Status:** implemented and verified. Four of five packages shipped; jsdom
deferred (blocked upstream — see below).

## Scope

Five packages were planned; **four** shipped. jsdom was deferred — see below.

| Package | From | To | Outcome |
| --- | --- | --- | --- |
| `vitest` | 4.1.5 | 5.0.2 | ✅ shipped |
| `@vitest/coverage-v8` | 4.1.9 | 5.0.2 | ✅ shipped |
| `jsdom` | 29.1.1 | ~~30.1.1~~ | ❌ **deferred — blocked upstream** |
| `@testing-library/jest-dom` | 6.9.1 | 7.0.1 | ✅ shipped |
| `framer-motion` | 12.38.0 | 13.4.5 | ✅ shipped |

## jsdom 30 is blocked by a vitest 5 bug (discovered during implementation)

This was **not** predictable from the research: every package was checked in
isolation and all peer ranges resolve cleanly (`vitest` declares
`jsdom: "*"`), so no manifest constraint catches it. It only appears at
runtime.

`vitest` patches jsdom's `URL` to add `createObjectURL`, which requires
reaching into jsdom's internal Blob representation. It does so by sniffing a
private symbol off a Blob instance:

```js
// node_modules/vitest/dist/chunks/index.*.js
const implSymbol = Object.getOwnPropertySymbols(
  Object.getOwnPropertyDescriptors(new window.Blob())
)[0];

makeCompatBlob(blob) {
  const impl = blob[implSymbol];
  return new NodeBlob_([impl._bytes ?? impl._buffer], { type: blob.type });
}
```

Measured directly against both versions:

| jsdom | own symbols on a `Blob` instance | result |
| --- | --- | --- |
| 29.1.1 | `[ Symbol(impl) ]`, `_bytes` present | works |
| 30.1.1 | `[]` — none | `implSymbol` is `undefined` → `impl` is `undefined` → **`TypeError: Cannot read properties of undefined (reading '_bytes')`** |

jsdom 30 stopped exposing the impl symbol on the instance. Vitest's comment in
that code (*"this is cursed, and jsdom should just implement fetch API
itself"*) acknowledges the fragility.

**Impact when both were installed:** every code path calling
`URL.createObjectURL` threw — 9 test failures across `exportUtils`,
`calendar-export` and `ImportCredentialsDialog`, plus an unhandled exception.
All 9 disappeared on reverting jsdom alone.

**vitest 5.0.2 is the latest published release**, so there is no fixed version
to move to. jsdom stays at `^29.1.1` until vitest ships a fix. This costs
nothing: jsdom 30's only maintainer-declared breaking change was a Node floor
bump, and it delivers no feature this project needs.


`@testing-library/react` (16.3.2), `@testing-library/dom` (^10) and `vite`
(^8.0.10) are **not** upgraded — they are already compatible and changing them
would widen the blast radius for no benefit.

## Evidence standard

Phase 4 shipped a silent no-op because its central premise ("the shim's binary
is `tsc6`, so only real TS7 provides `tsc`") was asserted from a secondary
source and never verified against the installed tree. This spec therefore
separates **verified** claims from **unverified** ones explicitly, and every
version-compatibility claim below was read from the package's own
`package.json` or the maintainer-authored release body, not from a blog post.

Claims below marked ⚠️ are *not* independently verified and must be treated as
assumptions to be proven empirically during implementation.

## Compatibility (verified against primary sources)

- `vitest@5.0.2` — `engines.node: ^22.12.0 || ^24.0.0 || >=26.0.0`; local Node
  is v24.15.0 ✅. Peers: `vite: ^6.4.0 || ^7.0.0 || ^8.0.0` (have ^8.0.10 ✅),
  `@types/node: ^22.0.0 || >=24.0.0` (have ^24.12.2 ✅), `jsdom: *` optional.
- `@vitest/coverage-v8@5.0.2` peer-depends on the **exact** matching `vitest`
  version. The two must be bumped in lockstep; a mismatched pair is an
  install-time failure, not a runtime one.
- `jsdom@30.1.1` — the **only** maintainer-declared breaking change in the
  entire 30.x line is the Node floor `^22.22.2 || ^24.15.0 || >=26.0.0`.
  Local Node v24.15.0 sits *exactly on* that floor: any future Node downgrade
  below 24.15.0 breaks the install. Everything else in 30.0.0→30.1.1 is
  labelled Added/Fixed by the maintainers.
- `@testing-library/jest-dom@7.0.1` — breaking changes are a peer tightening
  only: `@testing-library/dom` becomes a required peer (`>=10 <11`) and Node
  ≥22. RTL 16.3.2 already requires `@testing-library/dom: ^10.0.0`, which
  satisfies it with no conflict and no RTL bump. **Pin 7.0.1, never 7.0.0** —
  7.0.0 shipped `vitest` as a *required* peer by mistake; 7.0.1 made it
  optional.
- `framer-motion@13.4.5` — peers `react`/`react-dom` `^18 || ^19` ✅. The
  entire 13.0.0 breaking-change list is one item: the optional
  `@emotion/is-prop-valid` dependency was removed in favour of an explicit
  `<MotionConfig isValidProp={...}>`.

### Correction to a premise carried into this phase

`framer-motion` is **not** a deprecated shim re-exporting `motion`. The
dependency direction is the reverse: `motion@13.4.5` depends on
`framer-motion@^13.4.5`. `framer-motion` is the base implementation and
carries no deprecation notice. **No migration to the `motion` package is in
scope**, and none is required.

## Pre-flight blast radius (measured, not estimated)

Every mechanically-detectable vitest 5 breaking change was grepped across all
424 test files in `frontend/src` before planning. Results:

| Vitest 5 breaking change | Hits |
| --- | --- |
| `vi.mock`/`vi.unmock`/`vi.hoisted` inside a block (now **throws** at collection) | **0** |
| Unawaited `.resolves` / `.rejects` (now **fails** instead of warning) | **0** — all 5 usages are correctly `await`ed |
| `.toThrow('')` (now matches any message) | **0** |
| `test.sequential` / `describe.sequential` / `sequential: true` (removed) | **0** |
| Removed entrypoints (`vitest/coverage`, `vitest/reporters`, …) | **0** |
| `VITEST_WORKER_ID` / `VITEST_POOL_ID` (now 1-based) | **0** |
| `@emotion/is-prop-valid` reliance | **0** |

This is why the phase is expected to be low-drama despite five majors moving
at once. The residual risk is concentrated in changes that **cannot** be
grepped for:

1. **`clearMocks` now defaults to `true`** (vitest 5). Vitest calls
   `.mockClear()` before every test. Mocking is pervasive here — 1,259
   occurrences across 163 files. `mockClear()` resets call history only, not
   implementations (that is `mockReset`), so tests that configure
   `mockReturnValue`/`mockResolvedValue` keep working; only a test that relies
   on **call history accumulating across test boundaries** breaks. That is
   rare and is itself a test smell, but it is the single most likely cause of
   scattered failures and can only be found by running the suite. ⚠️
2. **Coverage `include`/`exclude` matching changed** — patterns are now
   matched relative to root without the old "contains" semantics. Coverage
   *percentages* may shift even when every test passes. This affects
   reported numbers, not pass/fail.
3. **`getComputedStyle()` churn across jsdom 30.x** — 30.1.0 fixed several
   regressions that 30.0.0 itself introduced (border-width defaults, stylesheet
   ordering). Landing directly on 30.1.1 lands after those fixes, but
   style-dependent assertions deserve a spot-check. ⚠️
4. **framer-motion prop filtering** — with `@emotion/is-prop-valid` gone,
   unknown props may now reach the DOM, surfacing as React unknown-prop
   warnings or extra attributes. Zero code references it, so the exposure is
   indirect (it was an *optional auto-detected* dependency), and the suite is
   the detector. ⚠️

## Pre-existing condition found during design (deliberately NOT changed)

The frontend has **two** vitest configurations that disagree:

| | `frontend/vitest.config.ts` | `frontend/vite.config.ts` (`test` block) |
| --- | --- | --- |
| Setup file | `./src/test/setup.ts` | `./src/setupTests.ts` |
| jest-dom import | `@testing-library/jest-dom` (bare) | `@testing-library/jest-dom/vitest` |
| Coverage block | yes | no |
| Used by | plain `npx vitest run` | `npm test` — **this is what CI runs** |

CI runs `npm test -- --run --coverage`, and `package.json` defines `test` as
`vitest --config vite.config.ts`. So CI uses `vite.config.ts` and its
`--coverage` flag therefore runs on vitest *defaults*, ignoring the coverage
block that exists only in `vitest.config.ts`.

Both configs were run to completion during design and produce **identical**
results (2475 passed / 1 failed / 2476), so there is no split-brain today.
Consolidating them is a real cleanup but is **out of scope for this phase** —
it is an independent refactor that would confound the upgrade's signal. It is
recorded here and in the Upgrade Journal so it is not lost.

The consequence for this phase: **verification must be run against both
configs**, because jest-dom is imported two different ways and only one path
is exercised by CI.

## Baselines this phase must match

Captured on the pre-upgrade tree, idle, in the foreground:

- `npx vitest run` (→ `vitest.config.ts`): **2475 passed / 1 failed / 2476**
- `npx vitest run --config vite.config.ts` (→ CI's config): **2475 passed /
  1 failed / 2476**
- The single failure is the known-stable `PersonalDashboardProgressCard`
  "renders a weekly overtime/standby bar chart" assertion, failing identically
  on both configs and on every prior phase.
- `npx eslint .`: **4 problems (2 errors, 2 warnings)** — 2
  `react-hooks/set-state-in-effect` errors (`AdminSidebar.tsx:62`,
  `Sidebar.tsx:52`) and 2 React Compiler warnings in
  `useSkillsGridVirtualizer.ts`.
- `npm run build`: exit 0.

**vitest is flaky under machine load in this environment** — a run started
immediately after a production build lost ~380 tests to
`[vitest-pool-runner]: Timeout waiting for worker to respond`. Any result that
disagrees with the baseline must be re-run idle in the foreground before it is
believed. Research found no vitest-5 change to pool/worker defaults
(`pool: 'forks'` is unchanged), so this is environmental, not a regression
signal. ⚠️

## Non-goals

- Consolidating the two vitest configs.
- Migrating `framer-motion` → `motion`.
- Upgrading `@testing-library/react` or `@testing-library/dom`.
- Fixing the known-stable `PersonalDashboardProgressCard` failure.
- Fixing the pre-existing CI red (Ruff, Bandit, Prettier) — unrelated to this
  phase and untouched.

## Success criteria

1. Both vitest configs report 2475/1/2476 with the same single known failure.
2. `npx eslint .` reports exactly the 4 baseline problems.
3. `npm run build` exits 0 (the Phase 4 `tsc` guard still runs first).
4. `npx tsc -b --noEmit` exits 0.
5. `npm ci` from a deleted `node_modules` installs the intended versions —
   verified by reading the installed packages, not the manifest.
6. Upgrade Journal entry written.
