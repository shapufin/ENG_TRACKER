# Frontend audit hardening (2026-10-29)

**Primary goal:** no client export can carry a spreadsheet formula, the calendar never steals keys from an open dialog, and the approval dashboard agrees with the server about which month is "current".

## Audit verification (checked against code on branch `fix/frontend-audit-hardening`)

| # | Claim | Verdict |
|---|---|---|
| 1 | `exportUtils.ts` CSV skips `csvCell` | TRUE (line 29 hand-quotes). Callers: LeavePage, PayrollWagesPage, HoursLogExportButtons |
| 2 | Calendar arrow keys hijack dialogs; listener re-attaches on `[data]` | TRUE (`CalendarPage.tsx:38-54`). Gap: `select`/`contenteditable`/Radix menus also steal arrows |
| 3 | TL dashboard month key uses browser clock | TRUE (`TLApprovalDashboard.tsx:66`). No client Tirane helper exists; "1-hour drift" is really up to a day near midnight/month end |
| 4 | `h-8` on Button in CustomChartViewer | TRUE, lines 432, 443 (audit said 426/437). Other `h-8` are divs, not controls: leave |
| 5 | `setEditing(false)` in render, AdminDashboardPage:38 | PARTLY. React-sanctioned "adjust state in render"; `editActive` already derived. Low value, skip |
| 6 | `visibleKey` memo recreates array each render | FALSE. Memo is keyed on the joined string on purpose (commented). No change |
| 7 | Duplicate `setFormOpen(false)` LeavePage:65-66 | TRUE |
| 8 | Raw `bg-indigo/emerald/amber-500` progress colours | TRUE and wider: also purple/rose; same pattern in `LeaveStatsCards` (4 uses). No fill tone map exists in `tone.ts` |
| 9 | AdminShell "Admin Panel" fallback | FALSE problem: fallback only when branding is unset. Skip |

## Gaps added
- `exportUtils.test.tsx` asserts nothing about CSV content: add a formula-injection test (TDD).
- Calendar guard should cover `select`, `isContentEditable`, `[role=dialog|menu|listbox]`.

## Phases (each: test first, then fix)
1. **CSV**: `exportUtils.ts` map cells through `csvCell` (`@/lib/csvSafe`), join `\n`. Test reads Blob text for `=cmd`, `@x`, quotes.
2. **Calendar keys**: extract `shouldIgnoreCalendarKey(e)`; keep handler stable via ref for `data`, deps `[]`. Test: no navigation with open dialog / focused select.
3. **Tirane month**: add `currentMonthKeyTirane()` to `lib/date-format-utils.ts` via `Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Tirane"})`; use in TLApprovalDashboard. Test with fake timers at 2026-10-31T23:30Z (= Nov 1 Tirane).
4. **Tones**: add `toneFillClass` (`bg-tone-<t>-text` or existing solid token; verify token exists in index.css/tailwind first) to `tone.ts`; migrate OvertimeSummaryCards + LeaveStatsCards progress colours (check HRDashboardStats/TLStatsCards/KPICard for the same raw colours).
5. **Small**: CustomChartViewer drop `h-8 px-2 text-xs`, use `size="control-sm"`; LeavePage drop duplicate setter.

## Verify (once, at end)
`cd frontend; npx vitest run <touched>; npx eslint <touched>; npx tsc -b; node scripts/control-audit.mjs; node scripts/table-header-audit.mjs; node scripts/surface-audit.mjs; npx vitest run`

## Not now
Users-table virtualization, AdminDashboard render-state tweak, visibleKey memo, AdminShell fallback, backend caching.

## Status
Implemented 2026-10-29 on branch fix/frontend-audit-hardening (phases 1-5). Invariants recorded in docs/workflow-invariants.md item 38.
