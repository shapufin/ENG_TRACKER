# Tailwind CSS v4 Upgrade (Phase 3) — Design Spec

Part of the 7-phase major-dependency-upgrade series
(`docs/superpowers/specs/2026-09-28-major-dependency-upgrades-design.md`).
Read `docs/superpowers/UPGRADE-JOURNAL.md` (Phases 1-2) before starting —
this spec assumes those are already merged to `main`.

## Goal

Upgrade `tailwindcss` from `3.4.17` to `4.3.3` with zero unintended visual
regressions across the app's 5 roles x 2 themes x 2 viewports, using the
smallest diff that satisfies v4's mandatory breaking changes.

## Scope, grounded in the audit

`scripts/tailwind-v4-audit.mjs` (committed, re-runnable) scanned all 1205
files under `frontend/src` for known v4-breaking/changed class patterns.
Counts as of 2026-09-28:

| Pattern | Severity | Hits / files | v4 change |
|---|---|---|---|
| `bg-gradient-to-*` | breaking | 32 / 25 | renamed `bg-linear-to-*`; old class is a silent no-op |
| `flex-shrink(-0)` | breaking | 1 / 1 | renamed `shrink(-0)` |
| `flex-grow(-0)` | breaking | 0 / 0 | renamed `grow(-0)` — nothing to do |
| `overflow-ellipsis` | breaking | 0 / 0 | renamed `text-ellipsis` — nothing to do |
| bare `shadow-sm` | visual | 28 / 25 | old `shadow-sm` value moved to `shadow-xs`; cards get a heavier shadow if unpinned |
| bare `ring` | visual | 45 / 35 | default ring flips 3px blue-500 -> 1px currentColor; focus-visibility risk |
| bare `border` | visual | 725 / 250 (noisy — regex matches prose too, not just `className`) | default border color flips gray-200 -> currentColor |
| `outline-none` | check | 39 / 32 | still valid; `outline-hidden` is the new a11y-labeled alias |
| raw palette classes (`bg-emerald-500`, etc.) | check | 615 / 69 | color space RGB/HSL -> OKLCH; subtle hue shift, tone.ts tokens (CSS-var-based) are unaffected |

Non-class infrastructure that must change regardless of class usage:

- `frontend/postcss.config.js`: the `tailwindcss` PostCSS plugin is removed
  in v4; the package `@tailwindcss/postcss` replaces it. `autoprefixer`
  becomes redundant (v4 prefixes internally) — drop it from both
  `postcss.config.js` and `package.json`.
- `frontend/src/index.css`: `@tailwind base; @tailwind components;
  @tailwind utilities;` (3 lines) -> `@import "tailwindcss";` (1 line).
- `frontend/tailwind.config.js`: stays as a JS file, loaded via v4's
  `@config "../tailwind.config.js";` compatibility directive in
  `index.css`, instead of rewriting its ~140-line `theme.extend` (all
  CSS-var-backed colors, e.g. `hsl(var(--primary))`) into native `@theme`
  CSS syntax. Rationale: the CSS-var indirection this codebase already
  uses is exactly what `@theme` would give natively, so a full rewrite
  buys nothing visually and multiplies the diff for no behavior change.
  Full native-`@theme` migration is explicitly OUT OF SCOPE for this
  phase (YAGNI — not requested, no behavior gap it closes).
- `tailwindcss-animate` (`^1.0.7`, the v3 JS plugin registered via
  `plugins: [require("tailwindcss-animate")]`, providing `animate-in`,
  `fade-in-0`, `zoom-in-95`, `slide-in-from-*` used by 8 Radix-driven
  files — dialogs, dropdowns, popovers) uses the v3 `addUtilities`/`theme`
  plugin API, which v4 does not run the same way. Replace with
  `tw-animate-css`, a pure-CSS v4-native package exposing the same class
  names (drop-in: swap the `require()` plugin line for a CSS `@import`,
  no class-name changes needed at call sites).
- `prettier-plugin-tailwindcss` is already `^0.8.0`, which supports v4 —
  no action needed.
- `tailwind-merge` is already on its `^3.x` major, built against v4's
  utility set — no action needed.

## Non-goals (explicitly out of scope, ladder-checked)

- Rewriting `tailwind.config.js`'s `theme.extend` into native `@theme` CSS.
- Migrating the 615 raw-palette-class hits to `tone.ts` tokens (pre-existing
  tech debt tracked by CLAUDE.md's "not migrated" list, unrelated to this
  upgrade; the OKLCH shift is expected, visible-but-subtle, and accepted).
- Any change to `frontend/src/lib/motion.ts`'s framer-motion system — that
  is a separate animation stack from `tailwindcss-animate`, untouched here.

## Verification strategy

Manually eyeballing 778 source files is not tractable. This project already
has purpose-built tooling for exactly this problem
(`.devin/context/12-VISUAL-VERIFICATION.md`):

1. **Before any change**: `node scripts/visual-verify.mjs capture` (one full
   run — 5 roles x 2 themes x 2 viewports x routes) with both servers on
   `main`, to produce the pre-upgrade baseline fingerprints.
2. **After the upgrade + fixes**: `node scripts/visual-verify.mjs verify`
   (one full run) diffs live-rendered fingerprints against the baseline and
   exits 1 on regression, with exact old->new computed-style values per
   landmark component. This is the authoritative signal for "did the
   border/shadow/ring default changes actually move anything," not the
   audit script's raw grep counts.
3. Respect the documented throttle budget: exactly these two full
   `capture`/`verify` runs. Any mid-implementation spot-check uses
   `--paths=` / `--role=` / `--theme=` filters, never another full run.
4. `node scripts/tailwind-v4-audit.mjs` re-run after the rename pass must
   show zero `breaking`-severity hits.
5. `node scripts/modal-audit.mjs` (static, no browser) must still exit 0 —
   confirms the dialog scroll contract survived the `tailwindcss-animate`
   -> `tw-animate-css` swap.
6. Frontend unit/component suite: `cd frontend && npx vitest run` once,
   full pass, after all fixes (targeted runs while iterating).
7. `npm run build` must succeed (validates the new PostCSS/plugin pipeline
   end-to-end, not just dev-server HMR).

## Manual checklist — go/no-go vs nice-to-have, ordered by blast radius

**Go/no-go (must pass before merge):**
1. `npm run build` succeeds with zero errors.
2. `visual-verify.mjs verify` reports zero regressions (or every reported
   diff is triaged and explicitly accepted as intended, e.g. the
   `shadow-sm`/OKLCH shifts, with the reasoning recorded in the journal).
3. `modal-audit.mjs` exits 0 (dialog contract intact after animate-plugin
   swap).
4. All 8 `tailwindcss-animate`-consuming files (dialogs/dropdowns/popovers)
   visually open/close correctly in a live browser check — these are the
   highest-blast-radius surface since a broken animation plugin either
   breaks the transition entirely or leaves a component stuck invisible.
5. Full `vitest run` passes at the same count as pre-upgrade baseline.

**Nice-to-have (note in journal, don't block merge):**
6. Spot-check 2-3 raw-palette-heavy pages (calendar, organigrama, skills
   matrix — the top hit files) for any OKLCH shift a reasonable person
   would call a regression rather than expected subtle drift.
7. Confirm `outline-none` usages still make sense given `outline-hidden`
   exists now — no fix required unless one is actually wrong today.

## Rollback procedure

If `visual-verify.mjs verify` or the build surfaces problems that aren't
cleanly fixable within this phase:

1. `git worktree remove` the phase branch's worktree without merging.
2. `main` is untouched (worktree isolation — same pattern as Phases 1-2).
3. If already merged to `main` but not yet pushed: `git reset --hard
   <pre-merge-sha>` on `main` (recorded in the journal entry before
   merging).
4. If already pushed to `origin/main`: revert via `git revert -m 1
   <merge-commit-sha>` (never force-push `main`), then re-open the phase
   as a fresh attempt once the blocker is understood.
5. Re-run `visual-verify.mjs capture` against the reverted `main` to
   confirm baselines match pre-upgrade state (proves the revert is clean,
   not just "no error thrown").

## Phase ordering note

Per the master spec, Phase 3 (Tailwind) has no ordering dependency on
Phases 4-7. Phase 4 (TypeScript 7) must still precede Phases 5-6, unaffected
by this phase's order.

## Journal entry template (filled in at completion)

Exact versions + date, breaking changes found vs. assumed, verification
command output summary (audit script zero-breaking confirmation,
visual-verify diff summary, build/test pass counts), any triaged-and-accepted
visual diffs with reasoning, residual/out-of-scope items carried forward.
