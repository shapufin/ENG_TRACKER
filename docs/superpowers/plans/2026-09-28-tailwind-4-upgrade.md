# Tailwind CSS v4 Upgrade (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `tailwindcss` 3.4.17 -> 4.3.3 in `frontend/` with zero
unintended visual regressions, using the smallest diff that satisfies v4's
mandatory breaking changes.

**Architecture:** Keep `tailwind.config.js` as a JS file loaded via v4's
`@config` compatibility directive (no native `@theme` rewrite). Swap the
build-only PostCSS plugin and the `tailwindcss-animate` plugin for their v4
equivalents. Fix the mechanical class renames the audit script found by
exact match. Find real visual regressions from the default-value changes
(border/ring/shadow) via the project's existing fingerprint-diff tooling,
not by manual inspection of 778 files.

**Tech Stack:** Vite, PostCSS, Tailwind CSS v4, Playwright (visual-verify),
Vitest.

**Spec:** `docs/superpowers/specs/2026-09-28-tailwind-4-upgrade-design.md`

## Global Constraints

- Only these package changes: `tailwindcss` 3.4.17 -> 4.3.3; add
  `@tailwindcss/postcss@4.3.3`; add `tw-animate-css` (latest); remove
  `tailwindcss-animate` and `autoprefixer`. No other dependency touched.
- `tailwind.config.js` stays a `.js` file loaded via `@config
  "../tailwind.config.js";` — never rewrite its `theme.extend` into native
  `@theme` CSS syntax in this phase.
- Exactly two full `node scripts/visual-verify.mjs` runs in the entire
  phase: one `capture` (Task 1, pre-upgrade baseline) and one `verify`
  (Task 5, post-upgrade diff). Every other visual check uses `--paths=`/
  `--role=`/`--theme=` filters against the already-captured baseline.
  Violating this exhausts the DRF `1000/hour` throttle (see
  `.devin/context/12-VISUAL-VERIFICATION.md`).
- `node scripts/tailwind-v4-audit.mjs` must report zero `breaking`-severity
  hits before this phase is considered done.
- `node scripts/modal-audit.mjs` must exit 0 at the end (dialog scroll
  contract intact through the animate-plugin swap).
- Full `cd frontend && npx vitest run` exactly once, at the end, after all
  fixes — targeted test files only while iterating.
- `npm run build` (not just `npm run dev`) must succeed — validates the
  PostCSS/plugin pipeline for real, since Vite dev/HMR can mask a plugin
  misconfiguration that only breaks production builds.

## Review Focus

1. `tailwindcss-animate` -> `tw-animate-css` breaking a dialog/dropdown/
   popover's open or close animation in one of the 8 consuming files — a
   reasonable person expects the same visual transition, and a broken
   plugin can leave a Radix component stuck invisible, not just
   misstyled. (`Task 8`)
2. Default border-color flip (gray-200 -> currentColor) making a shared
   `components/ui/*` primitive's border invisible or wrong-colored,
   cascading to every page that reuses it. (`Task 6`)
3. Default ring flip (3px blue-500 -> 1px currentColor) silently weakening
   or removing a focus-visible ring on a shared input/button primitive —
   an accessibility regression, not just cosmetic. (`Task 7`)
4. A `bg-gradient-to-*`/`flex-shrink` hit missed by the batch rename,
   silently becoming a no-op utility (no error, just wrong/missing
   styling). (`Task 4`'s own re-audit step is the test for this.)
5. The PostCSS pipeline silently producing an unstyled build (wrong
   plugin registration failing quietly rather than erroring) — `npm run
   build` succeeding is necessary but not sufficient; the build's actual
   output must be exercised by the visual-verify capture in Task 5, not
   just a green exit code. (`Task 3`'s build check + `Task 5`)

---

### Task 1: Pre-upgrade baseline (no code changes)

**Files:** none modified. Produces gitignored artifacts under
`design-fingerprints/` and a vitest count recorded in the SDD ledger.

**Interfaces:**
- Produces: the `design-fingerprints/` baseline that Task 5's `verify` run
  diffs against, and a recorded pre-upgrade vitest pass/fail count for
  Task 9 to compare against.

- [ ] **Step 1: Ensure Playwright's browser is installed**

Run: `cd frontend && npx playwright install chromium`

- [ ] **Step 2: Start both dev servers**

Run (from repo root): `python manage.py runserver 127.0.0.1:8000 --noreload`
(background) and (from `frontend/`): `npm run dev -- --host 127.0.0.1`
(background).

- [ ] **Step 3: Record the pre-upgrade vitest baseline**

Run: `cd frontend && npx vitest run` (full run). Record the exact pass/
fail/skip counts in the ledger — Task 9 must match or exceed this.

- [ ] **Step 4: Capture the ONE pre-upgrade visual baseline**

Run: `cd frontend && node scripts/visual-verify.mjs capture` (full — no
filters). This is one of the phase's two full runs; do not repeat it.

- [ ] **Step 5: Stop both dev servers, record completion in the ledger**

No commit — this task changes no tracked files.

---

### Task 2: Bump Tailwind packages and swap the animate plugin

**Files:**
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: `tailwindcss@4.3.3`, `@tailwindcss/postcss@4.3.3`,
  `tw-animate-css` available in `node_modules` for Task 3 to wire up.

- [ ] **Step 1: Install the new packages, remove the old ones**

Run (from `frontend/`):
```bash
npm install --save-dev tailwindcss@4.3.3 @tailwindcss/postcss@4.3.3 tw-animate-css
npm uninstall tailwindcss-animate autoprefixer
```

- [ ] **Step 2: Confirm `package.json` reflects exactly these changes**

Run: `git diff frontend/package.json` — expect `tailwindcss` version
bump, two new devDependencies added, `tailwindcss-animate` and
`autoprefixer` removed, nothing else changed.

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: bump tailwindcss to 4.3.3, swap tailwindcss-animate for tw-animate-css"
```

---

### Task 3: Update the build config (PostCSS + CSS entry point)

**Files:**
- Modify: `frontend/postcss.config.js`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: packages installed in Task 2.
- Produces: a working v4 build pipeline for every later task to build on.

- [ ] **Step 1: Update `postcss.config.js`**

Replace the `tailwindcss: {}` and `autoprefixer: {}` plugin entries with a
single `"@tailwindcss/postcss": {}` entry (v4 folds vendor-prefixing in).

- [ ] **Step 2: Update `frontend/src/index.css`'s Tailwind directives**

Replace the existing
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```
with:
```css
@import "tailwindcss";
@config "../tailwind.config.js";
@import "tw-animate-css";
```
placed at the very top of the file, before any other rule (v4 requires
`@import`/`@config` to precede other CSS). Leave every other rule in
`index.css` (the CSS custom properties for colors, etc.) untouched.

- [ ] **Step 3: Verify the dev server boots without a PostCSS error**

Run: `cd frontend && npm run dev -- --host 127.0.0.1`, load
`http://127.0.0.1:5173` in the browser tool, confirm the page renders
with visible Tailwind-driven styling (not unstyled HTML) and the
terminal/console shows no PostCSS/Tailwind error. Stop the server after.

- [ ] **Step 4: Verify the production build pipeline**

Run: `cd frontend && npm run build`. Expect success (exit 0). This is the
Review Focus #5 check — a silent styling failure would still exit 0, so
this step alone is necessary but not sufficient; Task 5's capture is the
real test.

- [ ] **Step 5: Commit**

```bash
git add frontend/postcss.config.js frontend/src/index.css
git commit -m "build: migrate PostCSS config and CSS entry point to Tailwind v4"
```

---

### Task 4: Mechanical breaking-class renames

**Files:** the exact file list from
`node scripts/tailwind-v4-audit.mjs --json` under the `bg-gradient-to` and
`flex-shrink` keys (26 files total as of the spec's audit: 25 for
`bg-gradient-to-*`, 1 for `flex-shrink`) — re-run the audit script first
to get the current, authoritative list rather than trusting the spec's
snapshot, since Tasks 2-3 may have touched files that also have these
patterns (unlikely, but the script is the source of truth, not the spec
table).

**Interfaces:**
- Consumes: `scripts/tailwind-v4-audit.mjs --json` output.
- Produces: zero `breaking`-severity hits for later tasks/final review to
  confirm.

- [ ] **Step 1: Get the current file list**

Run: `node scripts/tailwind-v4-audit.mjs --json` from repo root, extract
the `files` keys under `bg-gradient-to` and `flex-shrink`.

- [ ] **Step 2: Rename `bg-gradient-to-<dir>` to `bg-linear-to-<dir>`**

For every file from Step 1, replace `bg-gradient-to-t`, `-b`, `-l`, `-r`,
`-tr`, `-tl`, `-br`, `-bl` with `bg-linear-to-t`, `-b`, `-l`, `-r`, `-tr`,
`-tl`, `-br`, `-bl` respectively (a straight substring rename — the
suffix after `bg-gradient-to-` is unchanged).

- [ ] **Step 3: Rename `flex-shrink`/`flex-shrink-0` to `shrink`/`shrink-0`**

In `src/pages/calendar/components/CalendarBottomCards.tsx` (or wherever
Step 1's current scan places it), rename the one hit.

- [ ] **Step 4: Re-run the audit script, confirm zero breaking hits**

Run: `node scripts/tailwind-v4-audit.mjs` — the `BREAKING` section must
show 0 matches for every pattern.

- [ ] **Step 5: Run any existing tests for the touched files**

Run: `cd frontend && npx vitest run <touched test files, if any exist for
these components>`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix: rename bg-gradient-to-* and flex-shrink for Tailwind v4"
```

---

### Task 5: Post-upgrade visual diff (the second and last full run)

**Files:** none modified. Produces a diff report used by Tasks 6-7.

**Interfaces:**
- Consumes: the Task 1 baseline, the Tasks 2-4 changes.
- Produces: `design-fingerprints/diff-report.txt` (or equivalent CLI
  output) that Tasks 6-7 triage against the spec's pre-accepted-drift list
  (`shadow-sm` size increase, raw-palette OKLCH shift) vs. real
  regressions (border/ring changes that break a landmark component).

- [ ] **Step 1: Start both dev servers** (same as Task 1, Step 2).

- [ ] **Step 2: Run the ONE post-upgrade full verify**

Run: `cd frontend && node scripts/visual-verify.mjs verify` (full — no
filters). This is the phase's second and final full run.

- [ ] **Step 3: Triage every reported diff**

For each regression `verify` reports, classify it as either:
(a) pre-accepted per the spec (a `shadow-sm`-sized shadow increase, or a
subtle color-space shift on a raw-palette class) — record it in the
ledger with that reasoning, no fix needed; or
(b) a real regression (an invisible/wrong border, a missing focus ring,
any layout shift) — add it to a fix list for Tasks 6-7, tagged by which
shared `components/ui/*` file or page-level file it traces to.

- [ ] **Step 4: Stop both dev servers, write the triage list to the ledger**

No commit — this task changes no tracked files.

---

### Task 6: Fix real border-color regressions

**Files:** determined by Task 5's triage list — expected candidates are
`components/ui/*` shared primitives (check `card.tsx`, `checkbox.tsx`,
`select.tsx`, `tabs.tsx`, `TriStateCheckbox.tsx` first, per the audit
script's `border-bare` top-hit list) plus `src/index.css` if a global rule
relies on the old default.

**Interfaces:**
- Consumes: Task 5's fix list.
- Produces: borders matching their pre-upgrade rendered color.

- [ ] **Step 1: For each flagged file, pin the border to its intended color**

Add the explicit color utility (or tone token, per this codebase's
existing convention — e.g. `border-line-subtle` rather than a raw
palette class) instead of relying on the bare `border` utility's new
default.

- [ ] **Step 2: Re-verify only the affected paths (filtered, not full)**

Run: `node scripts/visual-verify.mjs verify --paths=<affected routes>` to
confirm the specific diffs are gone, without spending another full run.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "fix: pin explicit border colors broken by Tailwind v4's default-border-color change"
```

If Task 5 found zero real border regressions, mark this task complete
with a ledger note "no regressions found, no changes made" and skip
Steps 1-3.

---

### Task 7: Fix real focus-ring regressions

**Files:** determined by Task 5's triage list — expected candidates are
input/button/dialog shared primitives using bare `ring` (per the audit
script's `ring-bare` hit list).

**Interfaces:**
- Consumes: Task 5's fix list.
- Produces: focus-visible rings matching their pre-upgrade width/color
  (an accessibility requirement, not just visual parity).

- [ ] **Step 1: For each flagged file, pin the ring width and color explicitly**

Replace bare `ring` with the explicit pre-upgrade equivalent (e.g.
`ring-2 ring-<token>`) wherever the diff shows a weakened or invisible
focus indicator.

- [ ] **Step 2: Re-verify only the affected paths (filtered, not full)**

Run: `node scripts/visual-verify.mjs verify --paths=<affected routes>`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "fix: pin explicit focus-ring styling broken by Tailwind v4's default-ring change"
```

If Task 5 found zero real ring regressions, mark this task complete with
a ledger note "no regressions found, no changes made" and skip Steps 1-3.

---

### Task 8: Manually verify the 8 tailwindcss-animate-consuming files

**Files:** none modified (verification only) unless a real break is
found, in which case fix in place.

**Interfaces:**
- Consumes: the file list from `grep -rl "animate-in\|fade-in-0\|
  zoom-in-95\|slide-in-from" frontend/src --include="*.tsx"
  --include="*.ts"` (8 files as of the spec's scan — re-run to confirm).

- [ ] **Step 1: Get the current file list and identify one representative UI flow per file**

(e.g. a dialog that opens, a dropdown that expands, a popover that shows).

- [ ] **Step 2: Start both dev servers, open each flow live in the browser tool**

For each of the 8 files' component, trigger its open and close
interaction. Confirm the transition plays (fade/zoom/slide), not an
instant snap-in/out and not a stuck-invisible element.

- [ ] **Step 3: If any animation is broken, fix it**

Likely causes: a missing `tw-animate-css` class-name mapping, or a
`data-[state=]` selector `tw-animate-css` doesn't provide out of the box
— check `tw-animate-css`'s own docs for the exact class parity list
before assuming a manual keyframe port is needed.

- [ ] **Step 4: Stop both dev servers**

- [ ] **Step 5: Commit (only if Step 3 required a fix)**

```bash
git add -A
git commit -m "fix: restore <component> open/close animation after tw-animate-css swap"
```

---

### Task 9: Final verification pass

**Files:** none modified (verification only).

- [ ] **Step 1: Re-run the audit script, confirm zero breaking hits**

Run: `node scripts/tailwind-v4-audit.mjs` from repo root.

- [ ] **Step 2: Run `node scripts/modal-audit.mjs`**

Expect exit 0.

- [ ] **Step 3: Run the full vitest suite once**

Run: `cd frontend && npx vitest run`. Compare pass/fail/skip counts
against Task 1's recorded baseline — must match or exceed it (no new
failures).

- [ ] **Step 4: Run `npm run build` once more on the final diff**

Expect success.

- [ ] **Step 5: Record all four results in the ledger**

---

### Task 10: Upgrade Journal entry

**Files:**
- Modify: `docs/superpowers/UPGRADE-JOURNAL.md`

- [ ] **Step 1: Add the Phase 3 entry**

Follow the existing Phase 1/2 entry format: exact version + date, what
was found vs. assumed (call out anything Task 5's diff surfaced that the
spec's audit-script counts didn't predict), verification command results
(audit script, visual-verify triage summary, vitest counts, build
result), any pre-accepted visual drift with reasoning, residual/
out-of-scope items carried forward (native `@theme` migration,
raw-palette-to-tone-token migration — both explicitly deferred by the
spec).

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/UPGRADE-JOURNAL.md
git commit -m "docs: add Phase 3 (Tailwind v4) entry to the Upgrade Journal"
```

---

### Task 11: Present the whole-branch diff for final review

- [ ] **Step 1: Generate the full branch diff against `main`**

- [ ] **Step 2: Dispatch the final whole-branch code review** (most
  capable available model, per subagent-driven-development's model
  selection guidance) — focus it on the Review Focus list above.

- [ ] **Step 3: Address any findings, re-review the fix diff only**

- [ ] **Step 4: Report completion, ready for merge**
