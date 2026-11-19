# TL scorecard confusion audit: notes (2026-11-19)

Status: partial. Copy changed, behaviour unchanged. Browser checks not run.

## Decided
- Manager syncs: meetings between the Line Manager and the Manager (`tl_sync`, Manager as counterparty). The count is correct as built.
- Manager sync target 45/year: set for Enri as Line Manager in his KPI. Hardcoded in the UI for now. Make it dynamic when another role (for example PM) changes the Line Manager rating.
- Leave SLA: exclude public holidays. Not built yet. Past months' percentages will shift when it ships.
- 1-on-1 rules: unchanged. Only approved leave covering every working day of the month excuses a person. A skip with a reason excuses the month. A slot pushed past month-end counts as a miss.
- Auto-logged push with an auto-comment: parked. Not built.

## Copy changed (this session)
- Leave card label: "Leave decided within 2 business days".
- Leave and overtime trend: "N requests submitted this month" (the cohort is by submission date, not decision date).
- Engagement label: "Approval engagement (automated)", with the four weights listed underneath.
- 1-on-1 trend: "Target: 100% · excused if on leave all month or skipped with a reason".
- Manager syncs trend: "This month · annual target ≥45 (~4/mo)".

## Implemented (branch audit/tl-scorecard-2026-11-19, not committed)
- Fractions: `within_2_days`, `one_on_one_compliant`, `one_on_one_eligible` in the payload and on the cards. HBPR masks the 1-on-1 pair.
- YTD pace for manager syncs: `tl_sync_ytd` vs `tl_sync_expected_ytd` (ceil of 45 x month / 12), live, never frozen.
- Targets served by the backend (`targets`), so the UI no longer hardcodes 45, 12 or 100.
- Leave SLA excludes public holidays. Escalations for pending leave use the same rule. Overtime keeps weekday counting.

## Consequences to know
- Months already frozen keep their old leave numbers (freeze rule). Only live months and future freezes use the holiday rule.
- Trend query budget raised 22 to 24 on purpose (leave escalation holidays, Manager-sync dates for the year).
- Pre-existing `—` placeholders in these files trip the ux-ui-agent-skills emoji gate. Not changed here.
- HBPR sees `tl_sync_ytd` and `targets`. Manager syncs were already visible to HBPR as a count, so the YTD follows the same rule. Confirm with owner.

## Still open
- Browser check of the cards (1440 and 320) not run. Visual claims unverified.
- Sentiment threshold 8.5 is hardcoded in ScorecardOverview.tsx.
- Target 45 is still a backend constant, not per-role. Make it dynamic when PM or another role changes Line Manager rating.

## Fraction counts, in plain terms
The 1-on-1 card shows a percentage only. "6 of 7 met (85.7%)" would show the two counts behind it. The denominator excludes people excused by leave or skips, so "6 of 7" may not match team size. The frontend cannot compute these counts because the backend only sends the percentage. Recommendation: add `compliant_count` and `eligible_count` to the serializer and show them next to the percentage.

## Status and handover (2026-11-19, read this first when returning)

**Merged into main (all squash, all PRs MERGED):**
- #336 `15fa62f1` counts and pace behind percentages; holiday-aware leave SLA; HBPR masking of 1-on-1 counts.
- #337 `e914c988` zero-state copy ("No decisions yet this month"), "n/a" placeholders, frozen-month rule note.
- #338 `e48bc64f` targets per role (`SCORECARD_TARGETS_BY_ROLE`), used by cards and XLSX/PDF exports.
- Browser pass (1440 and 320 px, light and dark, clicks) ran on the running dev server before #337. #338 was merged while its CI checks were still running. Check its CI result on GitHub.

**Where the decisions live**
- Rules and consequences: `docs/workflow-invariants.md`, section "TL scorecard metrics".
- Masking list: `docs/hbpr-and-scorecard.md`.
- Test pins: `plugins/tl_scorecard/test_tl_scorecard.py`, `test_tl_scorecard_hbpr.py`, `test_scorecard_export_formats.py`, `test_trend_budget.py` (query budget 24).

**Deliberately deferred (decided later, not forgotten):**
- Per-person targets for each Line Manager (override on the role default, per year, admin-set, audited). Owner will decide when needed.
- Admin screen or DB table for targets. Numbers stay in code until then.
- Owner sign-offs still open: source of the 45-syncs target (Enri's KPI), whether HBPR may see the year-to-date sync pace, and the rule that one reasoned skip excuses the whole month.
- A slot pushed past month-end counts as a miss. An auto-logged push with an auto-comment is parked (conflicts with items 84 and 86).
- Leave holidays apply to the SLA only. Overtime turnaround still counts weekdays.
- Sentiment threshold 8.5 is hardcoded in `ScorecardOverview.tsx`.
- Export `report_kpis.py` falls back to a static table only when a scorecard has no targets.
- Frozen months keep their old leave numbers (freeze rule).
- Dash placeholders remain in other tl_scorecard files (outside this change) and trip the emoji gate there.
- Four frontend tests failed once under load (contention with the backend run), not reproduced alone.

**Git state at handover:** main == origin/main == `e48bc64f`. Remote feature branches of #336, #337 and #338 are deleted. Local leftover branches that are not from this work: `feat/mobile-scorecard-engagement`, `hbpr_ui_scorecard_fixes`, `fix/hbpr-scorecard-audit` (worktree in `.gemini`), kept on purpose.
