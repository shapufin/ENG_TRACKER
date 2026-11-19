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
