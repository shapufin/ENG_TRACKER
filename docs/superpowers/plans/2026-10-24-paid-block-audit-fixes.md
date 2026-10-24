# Paid-block audit fixes (2026-10-24)

## Primary goal
An admin, team leader or exporter reading overtime sees the same paid hours, block and end time the employee was paid for, and fractional hours are never shown rounded.

## Verification of the external audit (checked against code)

| Ref | Claim | Verdict | Evidence |
|---|---|---|---|
| F-01 | `post_delete` receiver calls `select_for_update()` outside `atomic()` on PostgreSQL | **FALSE** | `Collector.delete()` wraps pre_delete, the delete and `post_delete` in `transaction.atomic(savepoint=False)` (checked in installed Django source; post_delete is sent after the `atomic` line). Queryset deletes take the same path because a receiver is connected (no fast-delete). No change needed. Optional: one regression test that a bare `log.delete()` recalculates siblings. |
| F-02 | `absorb()` sets `end_time = rec['end_time']`, truncating a longer earlier span | **REAL** | `apps/reports/services/export_service.py:89`. Records are sorted by start, so 08:00-09:30 then 08:15-08:45 exports 08:00-08:45. Same flaw for covered (0h) entries absorbed into a host. Overnight care: compare ends as minutes after the row's start (end <= start adds 24h), a plain `max()` of `time` is wrong for 23:30-01:00. |
| F-03 | Admin edit preview uses admin as target user | **REAL** | `OvertimePage.tsx:51` `isAdmin && !editing && form.user`. `useOvertimeForm` sets `form.user = String(log.user)` on edit, so dropping `!editing` is enough. Backend `resolve_target_user` already honours `?user=` for admins. |
| F-04 | `AnimatedNumber` rounds, so 1.5h shows 2 | **REAL** | `AnimatedNumber.tsx:31` `Math.round`. Used by `OvertimeSummaryCards.tsx:103` with fractional hours. Many other callers (counts) must stay integer. |
| F-05 | Admin `HoursLogsTable` shows bare `{hours}h` | **REAL** | `HoursLogsTable.tsx:135`. Table is shared with standby, so only render the badge when the row carries `paid_window_*`. |
| F-06 | `RecordDetailModal` has no paid-window row | **REAL** | `getOvertimeFields` (RecordDetailModal.tsx:90) has none; serializer and type already expose `paid_window_start/end`. |
| F-07 | Old rows have NULL window until edited | Plausible, low; not verified here. They simply show no caption. Defer. |
| F-08/09 | Pass | Not re-verified. |

Note: untracked `apps/overtime/test_audit_probe.py` is an empty leftover ("Safe to delete"). Delete it before committing.

## Phase 0: Allowed references
- Pattern to copy for display: `frontend/src/pages/overtime/components/OvertimeHoursBadge.tsx`.
- Bundling tests: `apps/reports/test_paid_block_bundling.py`. Block rules: `docs/workflow-invariants.md` item 23.
- Anti-patterns: no new package; do not touch `paid_blocks.py` or add `transaction.atomic` for F-01; do not change `AnimatedNumber` default behaviour (integer rounding stays the default).

## Phase 1: F-02 export end time (backend, TDD)
How this serves the goal: the emailed/exported block end matches what was paid.
1. Add failing tests in `test_paid_block_bundling.py`: (a) 08:00-09:30 + 08:15-08:45 -> end 09:30; (b) covered entry shorter than host keeps host end; (c) overnight 23:30-01:00 + 23:45-23:50 -> end 01:00.
2. In `absorb`, keep the later end measured as minutes after the row's start (add 24h when end <= start).
3. Verify: `py -3.14 manage.py test apps.reports.test_paid_block_bundling`.

## Phase 2: F-03 admin edit preview (frontend, TDD)
How this serves the goal: an admin editing an employee's entry sees that employee's block.
1. Add a failing test (OvertimePage or hook test) asserting the preview request carries the entry owner's `user` when an admin edits.
2. Change `OvertimePage.tsx:51` to `isAdmin && form.user ? form.user : undefined`.
3. Verify: `cd frontend && npx vitest run src/pages/overtime`. Check the query key still changes with `user`.

## Phase 3: F-05 and F-06 display context (frontend)
How this serves the goal: reviewers understand 0h and shared entries.
1. `HoursLogsTable.tsx`: render `OvertimeHoursBadge` when the row has `paid_window_start`, else the bare `{hours}h` (standby unchanged). Widen the `HoursLog` interface with the optional window fields.
2. `RecordDetailModal.tsx` `getOvertimeFields`: push a "Paid block" row (`HH:MM-HH:MM`, plus "covered" wording when hours is 0) only when both window fields exist.
3. Tests: extend the existing table and modal tests; run `node scripts/table-header-audit.mjs` and `modal-audit.mjs`.

## Phase 4: F-04 fractional summary
How this serves the goal: 1.5h approved shows as 1.5, not 2.
1. Add optional `decimals` prop to `AnimatedNumber` (default 0, so every other caller is unchanged); format with `toLocaleString(undefined, {maximumFractionDigits: decimals})`.
2. `OvertimeSummaryCards` passes `decimals={2}` for hour totals only. Add tests to `AnimatedNumber.test.tsx` (default rounds, `decimals` keeps fraction).
3. God-node check: run trace `get_change_impact` on `AnimatedNumber` first (many callers).

## Final phase: Verification
- `py -3.14 manage.py check`, targeted backend tests, then once: `makemigrations --check`, full `manage.py test`, ruff on changed files, `cd frontend && npx tsc --noEmit && npx vitest run && npm run build`.
- Grep: no `Math.round` change affecting other callers; no `transaction.atomic` added to `paid_blocks.py`.
- Live check (admin edits an employee entry that shares a block; summary with a 0.5h entry; export of two overlapping entries) before merge. Use a new branch; no commit until asked.

## Not now
F-01 (false), F-07 backfill, F-08/F-09 (passes).
