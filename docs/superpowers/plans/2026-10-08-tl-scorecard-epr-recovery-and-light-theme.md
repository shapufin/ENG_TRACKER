# TL Scorecard EPR Recovery, Partnership Log Separation, Modal and Light-Theme Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unstick legacy EPR cycles, clarify "Log review", separate meeting types in both Partnership logs, fix narrow TL-scorecard modals, and finish the light-theme token/contrast pass.

**Architecture:** One backend change (`complete_stage` gains a legacy-recovery path). Everything else is frontend: shared presentational pieces (grouped evidence list, dialog size/token fixes) and token edits made only in `frontend/src/index.css` + `tailwind.config.js`, with `theme/tokens.test.ts` pinning values. Visual claims are verified in CloakBrowser at 375/768/1280 in light and dark.

**Tech Stack:** Django/DRF (`plugins/tl_scorecard`), React + Tailwind 4 + shadcn-style `Dialog`/`FormDialog`, vitest, CloakBrowser MCP.

**Spec:** the six points in the 2026-10-08 chat message (screenshots: Log a meeting modal, TL Partnership log, EPR cycles list, HBPR Partnership log). Context files: `.devin/context/03-FRONTEND-PATTERNS.md` §13/§15/§18, `docs/hbpr-and-scorecard.md`, `docs/table-header-contract.md`.

## Global Constraints

- Dialog width only via `size` (sm 448 / md 512 / lg 672 / xl 896); never `max-w-*`, `p-0`, `flex`/`overflow` on `DialogContent`. Done = `node scripts/modal-audit.mjs` exit 0.
- Colors via tone tokens (`bg-tone-<t>-surface`, `text-tone-<t>-text`); no `dark:` on them, no raw hex, no slate/zinc/gray.
- Light tokens live only in `:root` of `frontend/src/index.css`; `--border`/`--input` currently `214 32% 88%` and pinned in `src/theme/tokens.test.ts` — change both together. Fix contrast in the variant/token, never per call site.
- `text-primary` (`--primary-text`) is a different role from `bg-primary`; do not edit `--primary` to fix a link.
- `complete_stage` stays the ONLY writer of `*_completed_at` and goal rows; HBPR embed never exposes stage summary text/URL; employee one-on-ones stay hidden from HBPR.
- New `motion.*` must be reduced-motion-safe. Controls need accessible labels, keyboard use, 320px+ layout.
- Targeted tests while iterating; full suite once at the end (see Task 7). Use `py -3.14` for Django.

## Findings (from the code, not guesses)

1. **Stuck EPR cycles.** `describeCycle` (`frontend/src/plugins/tl_scorecard/components/EPRSection.tsx:91`) marks a step `blocked` when it is open but a later step is done and `goal_count < 5`; `blocked` has no action button. The backend agrees: `_goal_titles_for_stage` (`plugins/tl_scorecard/viewsets/epr.py:107`) rejects `goal_titles` for Goal Setting once Mid-year/Final is done, and without `goal_titles` it requires ≥5 stored goals (line 98). Result: a legacy cycle with Mid-year done and <5 goals (Aldaiir, Elencio, lediana, per screenshot) has no path forward. `parse_goal_pdf` is blocked the same way (line 135).
2. **"Log review"** (`TeamGovernanceSection.tsx:124`, `LogReviewDeliveryDialog.tsx`) logs a *management review delivery* (period, recipient, delivered-on, private notes). It feeds the "Management reviews (YTD)" stat (target ≥12/year). It is unrelated to EPR; the bare label invites that confusion, and it sits as the primary-colored button next to "Log meeting".
3. **Modals.** Every TL-scorecard form dialog is `size="sm"` = 448px (`LogMeetingDialog`, `LogReviewDeliveryDialog`, `FlagIdle/Absence`, `NominatePromotion`, `OpenPIP`, `StartEPRCycle`, `LogIdleStatusUpdate`, `NoteActionDialog`). The Log a meeting screenshot shows a form that is cramped and visually weak (sunken pill inputs on a white sheet, faint labels).
4. **Partnership log bloat.** `HbprPartnershipSection.tsx` (TL view, whole year in memory) and `hbpr/HbprEvidenceTimeline.tsx` (HBPR view, server-paged, backend already filters `?kind=`) both render one flat chronological list with a `Badge` per row, so cadence meetings, mid-year and year-end EPR participation interleave.
5. **Light theme.** `--background 220 20% 96%` vs `--card 0 0% 100%` vs `--border 214 32% 88%` is a very low step; screenshots show cards, pill tabs and outline buttons dissolving into the page.

## Review Focus

- Legacy cycle with Mid-year **and** Final done, Goal Setting open, 0 goals → must be recoverable and end "Complete".
- Recovery must not let a *new* cycle skip Goal Setting (sequence guard stays for mid_year/final_review).
- Two concurrent recovery submissions → one 409, no duplicated goals.
- HBPR evidence is server-paged: the kind filter must reset to page 1, survive reload via the URL, and show a per-kind empty state; no one-on-one content or private notes.
- TL view group with zero rows (no mid-year yet) shows an empty line, not a missing section.
- Dialog at 320px width and with long names/URLs: no horizontal scroll, footer buttons reachable.

---

## Delivery

Work on a branch off `main`, as three independently mergeable PRs: **A** = Tasks 1-2 (fixes what is broken today), **B** = Tasks 3-4, **C** = Tasks 5-6 (app-wide light theme, highest blast radius, reviewed on its own). Commits and pushes happen only when you ask. Out of scope, seen in the HBPR screenshot: "Export Summary" appears twice on that page (header and card).

## File Structure

- Modify `plugins/tl_scorecard/viewsets/epr.py`, test in `plugins/tl_scorecard/test_epr_stage_records.py` (Task 1)
- Modify `frontend/src/plugins/tl_scorecard/components/EPRSection.tsx` + `.test.tsx` (Task 1)
- Modify `TeamGovernanceSection.tsx`, `LogReviewDeliveryDialog.tsx`, `RecordsTab.tsx:43` (Task 2)
- Create `partnership/GroupedEvidenceList.tsx`, `hbpr/EvidenceKindFilter.tsx` (+ tests); modify `HbprPartnershipSection.tsx`, `hbpr/HbprEvidenceTimeline.tsx`, `HbprWorkspacePage.tsx`, `useHbprWorkspaceQueries.ts`, `hbprMeta.ts` (Task 3)
- Modify form dialogs listed in Finding 3, `components/ui/FormDialog.tsx` only if the shared fix belongs there (Task 4)
- Modify `frontend/src/index.css`, `tailwind.config.js`, `src/theme/tokens.test.ts`, `ui/button.tsx`/`card` variants if needed (Task 5–6)

---

### Task 1: Recover legacy EPR cycles

**Files:**
- Modify: `plugins/tl_scorecard/viewsets/epr.py:95-149`
- Test: `plugins/tl_scorecard/test_epr_stage_records.py`
- Modify: `frontend/src/plugins/tl_scorecard/components/EPRSection.tsx:91-123`
- Test: `frontend/src/plugins/tl_scorecard/components/EPRSection.test.tsx`

**Interfaces:**
- Consumes: `STAGE_ORDER`, `_ensure_stage_order`, `normalize_goal_titles`, `MIN_CONFIRMED_GOALS`.
- Produces: `complete_stage` accepts `goal_titles` for an **open** `goal_setting` even when `mid_year`/`final_review` are done (recovery); `parse_goal_pdf` accepts the same case. `describeCycle` no longer returns `blocked`; a stranded step is `evidence-only` when goals ≥5 and `recover` (new `StepState`) otherwise, both actionable.

Decision (smallest diff, compared with a data migration and a staff-only repair command): relax only the "locked by later stage" rule for an *open* Goal Setting. The sequence guard for Mid-year/Final is untouched, so new cycles cannot strand. No migration, no data rewrite.

- [ ] **Step 1: Write failing backend tests** in `test_epr_stage_records.py`: `test_recover_goal_setting_after_mid_year_with_goal_titles` (cycle with `mid_year_completed_at` set, 0 goals; POST `complete_stage` stage=`goal_setting`, 5 titles, summary → 200, 5 goals, `goal_setting_completed_at` set), `test_recover_goal_setting_after_final_review`, `test_mid_year_still_blocked_while_goal_setting_open` (400 `stage`), `test_recover_requires_five_titles` (400), `test_parse_goal_pdf_allowed_for_stranded_goal_setting`, `test_final_review_goal_titles_still_rejected`.
- [ ] **Step 2:** Run `py -3.14 manage.py test plugins.tl_scorecard.test_epr_stage_records` — expect the new tests FAIL (400 "cannot change goals after later stages").
- [ ] **Step 3:** In `_goal_titles_for_stage` delete the `stage == 'goal_setting'` later-stage rejection (lines 107-112) and in `parse_goal_pdf` delete the matching `Goal Setting is locked by a later completed stage` check (lines 135-138). Keep the mid_year/final_review checks. Update the docstring on `STAGE_ORDER` to say recovery is the one allowed out-of-order write.
- [ ] **Step 4:** Re-run the module — expect PASS, including the pre-existing out-of-order test at line ~182 (it asserts Mid-year-first is rejected; still true).
- [ ] **Step 5: Write failing frontend tests** in `EPRSection.test.tsx`: a cycle with `mid_year_completed_at` set and `goal_count: 0` renders a "Complete step" button labelled `Complete Goal Setting` and status "Out of order — confirm the goals to repair this cycle"; replace the existing `Blocked — a later step is already complete` assertion (line 136).
- [ ] **Step 6:** Run `cd frontend && npx vitest run src/plugins/tl_scorecard/components/EPRSection.test.tsx` — FAIL.
- [ ] **Step 7:** In `describeCycle` drop the `blocked` state (also the `step.state === "blocked"` colour check in the expanded details, ~line 238); for `stranded` return `state: "evidence-only"` (goals ≥5) or `state: "recover"` (goals <5) with the repair status text; add `recover` to `SEGMENT_CLASS` (warning tone) and to `actionable`. **Gap found in review:** the dialog call in `CycleRow` (~line 296) computes `goalsLocked` inline as "any later stage done", which would hide the PDF/goal inputs in exactly the recovery case. Change it to `goalsLocked={actionable?.state === "evidence-only"}`: a stranded step with 5+ goals keeps the evidence-only flow; `recover` shows the PDF + titles (the dialog already always sends `goal_titles` for `goal_setting`). Add a test: clicking the repair button on a recover cycle shows the "Workday PDF" field and not the "goals are locked" callout. The button reads "Repair goals" for `recover` (specific label per web-design-guidelines) and "Complete step" otherwise.
- [ ] **Step 8:** Run the vitest file plus `npx vitest run src/plugins/tl_scorecard` — PASS.
- [ ] **Step 8b: Side effects (read in code, no change needed; pin with a test):** `signals._on_epr_saved` will notify the employee (`EprStageCompleted`) when the repaired Goal Setting stamps; `services.py:443` and `viewsets_my_records.py:61` only read the timestamps, so out-of-order timestamps are safe. Add `test_recovery_accepts_goal_setting_stamped_after_mid_year` and `test_hbpr_cannot_complete_stage` (HBPR role gets 403/404).
- [ ] **Step 9:** Browser check as `enri.demnushi`: Aldaiir Xhelili expands, "Complete Goal Setting" opens the dialog, uploading a PDF confirms 5 goals, cycle flips to Complete/ Needs attention clears. Record in the PR.
- [ ] **Step 10: Commit** `fix(tl-scorecard): let legacy EPR cycles repair an open Goal Setting`.

### Task 2: Clarify "Log review"

**Files:** Modify `TeamGovernanceSection.tsx:121-126`, `LogReviewDeliveryDialog.tsx:70-80`, `records/RecordsTab.tsx:43`; tests alongside.

**Interfaces:** Produces only copy/variant changes; `onLogReview` prop name unchanged.

- [ ] **Step 1: Failing test** in the section's test: buttons are named `Log meeting` and `Log management review`; neither is `Log review`.
- [ ] **Step 2:** Run the section test — FAIL.
- [ ] **Step 3:** Rename the button and `RecordsTab` label to "Log management review"; make both buttons `variant="outline"` (neither is the page's primary action); set dialog description to "Record that a management review was delivered for a month. Counts toward the 12-per-year target; notes stay private to you and staff." Add `title` on the button with the same one-line purpose.
- [ ] **Step 4:** Run `npx vitest run src/plugins/tl_scorecard` — PASS.
- [ ] **Step 5: Commit** `fix(tl-scorecard): name the management review action unambiguously`.

### Task 3: Separate meeting types in both Partnership logs (items 3 and 6)

**Review correction:** the two views are not the same shape. The TL view (`HbprPartnershipSection`) receives the whole year's `evidence` array, so it can group client-side. The HBPR view (`HbprEvidenceTimeline`) is **server-paged** (`PageNav`, `total`, query key `["tl-scorecard","hbpr-evidence",year,leader,evidencePage]` in `useHbprWorkspaceQueries.ts:256`); grouping one page client-side would split groups across pages and show wrong counts. The backend already filters `?kind=` (`viewsets/evidence.py:78`), so the HBPR view separates types with a **server-side kind filter held in the URL** (web-design-guidelines: URL reflects state), not client grouping.

**Design (superdesign / design-is first; one variant each, pick against: scan a year in under 5 seconds, one idea per section, no new dependency):**
- TL view: three labelled sections, **Cadence meetings**, **Mid-year EPR**, **Year-end EPR**, each with a count; cadence capped to the newest 6 behind "Show all N". The section header carries the kind, so rows drop the per-row kind badge.
- HBPR view: segmented filter `All, Cadence, Mid-year, Year-end` (URL param `evidence_kind`, distinct from the records view's existing `kind` vocabulary); changing it returns to page 1 (existing `setParam` already deletes `page` for any other key). The timeline dot takes the kind's tone so "All" is still scannable; badge stays because mixed kinds share the list.

**Files:**
- Create: `frontend/src/plugins/tl_scorecard/components/partnership/GroupedEvidenceList.tsx` (+ `.test.tsx`)
- Create: `frontend/src/plugins/tl_scorecard/components/hbpr/EvidenceKindFilter.tsx` (+ `.test.tsx`)
- Modify: `scorecard/HbprPartnershipSection.tsx:176-230`, `hbpr/HbprEvidenceTimeline.tsx`, `pages/HbprWorkspacePage.tsx:45-80,186-200`, `hooks/useHbprWorkspaceQueries.ts:231-262` (add `kind` to key and params), `hbpr/hbprMeta.ts` (export `EVIDENCE_KIND_ORDER`)

**Interfaces:**
- Consumes: `HbprEvidenceKind = "cadence_meeting" | "epr_mid_year" | "epr_year_end"`, `EVIDENCE_KIND_LABELS`, `EVIDENCE_KIND_TONE` (`hbprMeta.ts`).
- Produces: `GroupedEvidenceList<T extends { id: number; kind: HbprEvidenceKind; occurred_on: string }>(props: { rows: T[]; renderRow: (row: T) => ReactNode }): JSX.Element`; `EvidenceKindFilter(props: { value: HbprEvidenceKind | "all"; onChange: (v: HbprEvidenceKind | "all") => void }): JSX.Element` (button group, `aria-pressed`, keyboard operable); `useHbprWorkspaceQueries({ ..., evidenceKind?: HbprEvidenceKind })`.

- [ ] **Step 1: Failing tests.** `GroupedEvidenceList`: groups rows in cadence, mid-year, year-end order; shows an empty line for a kind with no rows; collapses a group over 6 rows and expands on "Show all 8" (real `<button>` with `aria-expanded`); each group is a region labelled by its heading. `EvidenceKindFilter`: marks the active kind with `aria-pressed`; calls `onChange` with the kind. Workspace page: `?evidence_kind=epr_mid_year` requests `kind=epr_mid_year`, and changing it drops `page`.
- [ ] **Step 2:** `npx vitest run src/plugins/tl_scorecard/components/partnership src/plugins/tl_scorecard/components/hbpr src/plugins/tl_scorecard/pages` - expect FAIL.
- [ ] **Step 3:** Implement both components (tone tokens, `tabular-nums` dates, `min-w-0` and `break-words` on notes) and thread `evidenceKind` through hook and page.
- [ ] **Step 4:** Swap the call sites; delete the now-unused TL per-row kind badge; keep Edit, `Recorded by`, and the `Showing 1-4 of 4 entries` counter. A filtered-empty result shows the existing `EmptyState` naming the kind ("No mid-year EPR entries in 2026").
- [ ] **Step 5:** Run the three test dirs plus `py -3.14 manage.py test plugins.tl_scorecard.test_hbpr_invariants` (backend untouched; proves no regression) - expect PASS.
- [ ] **Step 6:** Browser check at 1280 and 375 as TL and as an HBPR user with more than one page of evidence (seed extra rows in a shell if needed); screenshot both.
- [ ] **Step 7: Commit** `feat(tl-scorecard): separate meeting types in the partnership log`.

### Task 4: Rework narrow TL-scorecard modals

**Files:** the dialogs in Finding 3; possibly `components/ui/FormDialog.tsx`; `scripts/modal-audit.mjs` run only.

**Decision:** keep the `size` contract, don't invent widths. Forms with ≥4 fields or paired fields (Log meeting, Open PIP, Flag absence, Complete EPR stage) move to `size="md"` (512) and use a two-column grid for short paired fields (Type/Date, Team member/Date) on `sm:`; confirm-style prompts (`NoteActionDialog`, `StartEPRCycleDialog`) stay `sm`. Then fix legibility in the *shared* pieces, not per dialog: `FieldLabel` color (muted, not pale) and input border use the token fixed in Task 5.

- [ ] **Step 1: Capture before** screenshots of every dialog in light mode at 1280 and 375 (CloakBrowser; `scripts/modal-capture.mjs` as reference) into the scratchpad.
- [ ] **Step 2: Failing test:** extend an existing dialog test with `expect(dialog).toHaveClass("max-w-lg")` for LogMeeting/OpenPIP/FlagAbsence and `max-w-md` for the two confirms.
- [ ] **Step 3:** Change the `size` props and add the paired-field grids (`grid gap-4 sm:grid-cols-2`).
- [ ] **Step 4:** `npx vitest run src/plugins/tl_scorecard && node scripts/modal-audit.mjs` — exit 0.
- [ ] **Step 5:** After screenshots at 320/375/768/1280 (confirm `overscroll-behavior: contain` on the scroll region and a visible focus ring on every field); check footer reachable and no horizontal scroll with a 120-char reference URL.
- [ ] **Step 6: Commit** `fix(tl-scorecard): size form dialogs for their content`.

### Task 5: Light-theme audit and token set (item 5)

Skills for this task: `claude-mem:design-is` and `superdesign:superdesign` to propose the light palette, `web-design-guidelines` to review the touched files.

**Files:** `frontend/src/index.css` (`:root` only), `src/theme/tokens.test.ts`, `frontend/scripts/` (new `light-contrast-audit.mjs`, scratch-quality, not committed unless useful).

**Interfaces:** Produces the final light values for `--background`, `--card`, `--border`, `--input`, `--muted-foreground`, `--surface-sunken`, `--line-subtle`, `--input-bg`, `--tone-*-border` that Task 6 consumes.

- [ ] **Step 1: Measure.** In CloakBrowser (light, `/tl-scorecard`, `/hbpr`, dashboard, admin table page) run `getComputedStyle` over cards, tabs, outline buttons, inputs, badges and compute WCAG ratios for: card vs page, card border vs card, input border vs input bg (non-text 3:1 per WCAG 1.4.11), muted text vs card and vs page (4.5:1), tone text vs tone surface. Save the table to the scratchpad; this is the evidence base.
- [ ] **Step 2:** Propose values (design-is/superdesign) meeting: page↔card visible step (page darkened to ≈`220 18% 94%` or a card shadow token), border ≥3:1 on inputs only (decorative card borders stay softer, ~1.3:1 plus shadow), muted-foreground ≥4.5:1 on both page and card, tone borders strong enough on white.
- [ ] **Step 3: Failing test:** update `tokens.test.ts` pins to the new values (Obsidian-Slate dark pins untouched) — FAIL.
- [ ] **Step 4:** Edit `:root` in `index.css`; leave `.dark` alone; no component edits here.
- [ ] **Step 5:** `npx vitest run src/theme` — PASS; re-run the Step 1 measurement and attach before/after table; every row meets its threshold.
- [ ] **Step 6: Blast radius.** These tokens restyle every page. Run the fingerprint/visual-diff tooling from `.devin/context/12-VISUAL-VERIFICATION.md` on dashboard, leave, calendar, overtime, a `DataTable` admin page, payroll, `/tl-scorecard`, `/hbpr`; list every page whose light screenshot changed and confirm each change is a contrast improvement; `table-header-audit` and `modal-audit` still exit 0.
- [ ] **Step 7: Commit** `fix(theme): light-mode surface, border and muted-text tokens`.

### Task 6: Light-mode component sweep

**Files:** `ui/button.tsx`, `ui/input.tsx`, `ui/tabs` pill, `ui/badge.tsx`, `GlassCard` — only where Task 5 tokens are not enough.

- [ ] **Step 1:** Re-screenshot the pages from Task 5 Step 1 in light mode; list any element still failing (pill-tab active state, outline button hover, badge border).
- [ ] **Step 2: Failing test** per fix in the component's existing test (class or token assertion).
- [ ] **Step 3:** Fix in the variant; reuse §18 outline-button rules (`bg-card`), `motion-reduce:` gating unchanged.
- [ ] **Step 4:** `npx vitest run src/components/ui src/theme && npx eslint src/components/ui`; before/after screenshots at 375/1280 light **and** dark (dark must be pixel-unchanged in tokens).
- [ ] **Step 5: Commit** `fix(ui): light-mode component contrast`.

### Task 7: Final verification

- [ ] `py -3.14 manage.py check && py -3.14 manage.py makemigrations --check && py -3.14 manage.py test plugins.tl_scorecard apps.plugins`
- [ ] `python -m ruff check --output-format=concise plugins/tl_scorecard/viewsets/epr.py plugins/tl_scorecard/test_epr_stage_records.py`
- [ ] `cd frontend && npx tsc --noEmit && npx vitest run && npm run build && node scripts/modal-audit.mjs && node scripts/table-header-audit.mjs`
- [ ] `security-review` skill over the Task 1 diff (a lock was relaxed): permission and scope paths in `epr.py` unchanged, HBPR still cannot write, scope still `scoreable_member_ids`.
- [ ] `web-design-guidelines` review of every touched `.tsx` (focus-visible, labels, `min-w-0`, no `transition: all`, URL state for filters).
- [ ] Append to `AGENTS.md` and the Hot Invariants line for EPR ("Goal Setting open + later stage done is recoverable via `complete_stage` with `goal_titles`") and update `docs/hbpr-and-scorecard.md`.

---

## Self-Review

- Spec coverage: 1→T1, 2→T2, 3 and 6→T3, 4→T4, 5→T5–6, writing-plans→this file. Gap: none.
- Names consistent: `describeCycle` states `recover`/`evidence-only`; `GroupedEvidenceList` used in both Task 3 call sites.
- Not yet verified (honest): contrast numbers in Finding 5 are read from the screenshots and CSS, not measured — Task 5 Step 1 measures them. Ratio thresholds there are WCAG's, the proposed HSL values are starting points.
- Proportion: kept to signatures, test names and decisions.
