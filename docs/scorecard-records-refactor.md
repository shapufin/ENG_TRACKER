# Scorecard Records Refactor — Cross-Agent Tracking (2026-10-03)

> **Workstream:** TL Scorecard `RecordsTab` + HBPR `HbprRecordExplorer` master-detail refactor.
> **Owner files (single-writer: this session):** `frontend/src/plugins/tl_scorecard/components/hbpr/*`,
> `frontend/src/plugins/tl_scorecard/components/records/*`, `frontend/src/plugins/tl_scorecard/hooks/useHbprWorkspaceQueries.ts`
> (read-only ok for others, no edits).
> **Other worker zone (DO NOT TOUCH):** `frontend/src/pages/admin/*`, `frontend/src/components/admin/*`,
> `apps/users/viewsets.py`, `apps/permissions/services/role_service.py` (dirty at HEAD — HBPR Users-tab work).
> Stage only own paths (`git add <paths>`), never `git add -A` without `git status` review. Never
> `checkout --` / `stash` / `clean` others' paths. Prettier only on touched files.
> Source of truth for HBPR invariants: `docs/hbpr-and-scorecard.md` + `CLAUDE.md` hot invariants.

## Status

- [x] Plan v2 hardened (verified file:line contracts, see `.devin/plans/plan-records-refactor-2026-10-03.md`)
- [x] Phase 1: `hbprRecordState` tone map + failing-first vitest (additive only) — 18/18 green
- [x] Phase 2a: HBPR category sidebar — desktop `nav[aria-label=Record types]` (`aria-pressed`,
  active `bg-muted`, server `total` beside the active kind only — no cross-kind total endpoint exists),
  mobile `Select` fallback, kind switch reuses `onFilterChange("resource")` (clears `status`+`page`, zero
  parent changes). 2 new tests (switch+drops-status, pressed+total), RED first.
- [x] Phase 2b: TL stat strip — pure `recordStripStats(config, rows)` (attention = warning/danger tones,
  done = success, `donePct` real ratio, zeros never NaN) + `RecordStrip` (3× `StatCard`, tone-safe icons,
  real-ratio progress bar). 4 new tests, RED first.
- [x] Phase 2c: TL local search — `?q=` URL param, matches title + state label + string cells, flows through
  the existing `narrow()` so badges/strip/list agree; "No match" hint updated to "Try another month or
  search."; placeholder "Search loaded records…" (honest: client-side only).
- [x] Phase 4 (this round): prettier, eslint clean, `tsc` clean, `modal-audit` PASS, 80/80 vitest, Playwright
  Chromium PASS (sidebar kind-switch + pressed, strip + search + No-match, asserted in-browser, screenshots
  inspected). Planted rows deleted via API; temp specs/screenshots removed.
- [x] Phase 4 (final): full `npx vitest run` — 2653 passed, 5 timeout-flakes in unrelated files
  (DataTable, FolderBrowser, PayrollRuleSetEditorDialog, SkillsTeamPage, TicketKPITeamManagementPage),
  all 5 pass in isolation (84/84) — load-induced, not this workstream. Backend
  `py -3.14 manage.py test plugins.tl_scorecard` — **317 tests OK** (production stack). `tsc` clean,
  eslint clean, `modal-audit` PASS. Dark-mode Chromium PASS (badges + strip readable, screenshots
  inspected). Planted rows deleted; temp specs/screenshots removed.

## DO-NOT-BREAK (fail-closed)

1. HBPR read-only: no action column in explorer; `approve/reject/decide` staff-only + self-dealing 403.
2. One-on-one invisibility: `hbpr_exclude` on Meeting + Attendee, `_mask_one_on_one`, `HBPR_RECORD_STATUSES.meetings`
   has no `one_on_one`, mappers never surface `notes` for reviews. Guessed-id must 404 (`test_hbpr_invariants.py`).
3. Vocab: `kind` = `meetings|idle|absences|reviews|pips|promotions` shared with notification deep links — never rename.
   `reviews` has no `?status=` (any value → 400). `?kind=` required. `EPR` is not a kind.
4. Scope: empty scope ≠ None; viewer excluded; `effective_to` = last day in effect (`in_effect_q`/`unfinished_q`);
   `cadence_status` single definition; leader+member AND-ed; out-of-scope `?leader=` → `null` + `{count:0}` (not 403).
5. Evidence vocab disjoint (`cadence_meeting|epr_mid_year|epr_year_end`); timeline filters cadence locally by
   `occurred_on` year — never server `?year=` (drops cadence rows).
6. Query keys exact: TL `["tl-scorecard","records",key]`; HBPR `["tl-scorecard","hbpr-records",recordObj,leader]`
   (+ `hbpr-overview`, `hbpr-evidence`); `isHBPROnly → /hbpr` redirect stays outer (zero authoring queries fire).
   `useRecordActions` invalidates `records|scorecard|escalations|pip-records` prefix only.
7. Theme: tone tokens only (`toneSurfaceClass`, `Badge` variants — no `danger` Badge, use `destructive`/danger tone);
   `text-primary` for links (never edit `--primary`); no `dark:` on tone callsites; sky-700 solid / sky-600 tinted;
   `StatCard progressPercent` = real ratio or omitted; `truncate` ⇒ `title`; status ⇒ `role="status"` + icon + text.
8. Dialog `size=` + single `DialogBody`; `DataTable` owns `overflow-x-auto`; motion via `lib/motion.ts` +
   `useReducedMotion` gate; `PageNav` server paging kept; export = XLSX only (honest label, no fake CSV).

## Backend gaps flagged (NOT building — visual-only refactor)

No cross-kind total, no generic Completion % / Notes-Synced % / Monthly-Target % / Avg Duration (Meeting has date
only); no records `?q` (only `hbpr/people/?q=`); no CSV; no latest-summary aggregate (derive client-side from page
`shared_summary/shared_notes/action_items`); no per-type aging endpoint (only `escalation_candidates` +
cadence/EPR `needs_attention`). Stat strip uses honest per-kind metrics only.

## Verification log

| Phase | Command | Result |
|---|---|---|
| 1 | `npx vitest run src/plugins/tl_scorecard/components/hbpr/hbprRecordState.test.ts` | 18/18 PASS (RED first: missing module; then spec fixes for LucideIcon object type + title-case) |
| 1-3 | `npx vitest run pages/HbprWorkspacePage.test.tsx + hbprRecordState.test.ts + records/RecordsTab.test.tsx` | 73/73 PASS (new tone-badge test RED first: rendered "open", now "…working days open" + `role=status`) |
| 2a-2c | same 4 files | 80/80 PASS (sidebar switch+drops-status, pressed+total, strip, search — all RED first) |
| 2a-2c | Playwright Chromium (temp spec, since deleted) | PASS: sidebar kind-switch absences→promotions (URL+pressed), `role=status` badges, TL strip (Total/Needs attention "All clear"/Completed), search→"No match"; screenshots inspected; planted rows deleted via API |
| deep | Playwright Chromium 393×851 (temp spec, since deleted) | PASS: HBPR select+cards, desktop sidebar buttons hidden; TL strip stacks 1-col, search usable; screenshots inspected; planted rows deleted via API |
| deep | Measured WCAG ratios (alpha-composited, real DOM) | light badge **5.05** / sidebar **15.11** / strip **16.25**; dark badge **11.07** / sidebar **12.95** / strip **16.01** — all ≥ 4.5 AA. Targets: sidebar 36px, search 40px (≥ 24 WCAG 2.5.8) |
| 4 | `npx tsc -b --noEmit` | 1 error, all in other worker's zone (`components/admin/UserFilterTabs.test.tsx`: missing `@testing-library/user-event`) — pre-existing, untouched by this workstream |
| 4 | `npx eslint` on 5 touched files | clean |
| 4 | `node scripts/modal-audit.mjs` | PASS |
| 1-3 | `npx vitest run src/plugins/tl_scorecard` | pending |
| 4 | `npx tsc -b --noEmit`, `node scripts/modal-audit.mjs` | pending |
| 4 | `py -3.14 manage.py test plugins.tl_scorecard` | pending |
| 4 | Playwright `e2e/hbpr-governance.spec.ts` + `visual-verify capture/check` | pending (needs `prepare_e2e_db` BEFORE servers) |
