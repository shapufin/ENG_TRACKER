# User-facing frontend audit (2026-10-22)

Scope: pages outside `pages/admin` (overtime, standby, leave, team, TL approvals, dashboard, hr, calendar, settings) plus shared tables. Base: origin/main c13c4c8.
Baselines: tsc failed on main (missing `AdminLeaveRequestsPage`, fixed by cherry-pick of 9f206da from #166, drops out on rebase); table-header, modal, control, surface audits all PASS.
Verification (2026-10-22): full vitest 3592/3592, `npm run build` ok. Playwright captures (own e2e backend + Vite from this worktree, 1440 and Pixel 5, light and dark) of `/overtime`, `/standby`, `/team/approvals` show the status chips rendering, no horizontal overflow, 3 chips on each hours page. Not verified: chip filtering with real rows (unit-tested only; seed had no records), contrast measurements, axe, other pages. Pre-existing, not touched: the empty-state text is clipped ("No re") inside the table on mobile.

| # | Finding | Evidence | Sev | Status |
|---|---|---|---|---|
| 1 | Admin Standby reject uses `prompt()`; cancel/empty silently does nothing | `pages/admin/hooks/useStandbyLogsPage.ts:66` (before) | MEDIUM | Fixed: reuses `RejectionReasonDialog`, hook test |
| 2 | TL pending-stat cards have `role="button"` + `tabIndex=0` but no key handler (GlassCard has none), so keyboard cannot jump to a month | `components/team/TLApprovalStats.tsx:54-56` | HIGH (a11y) | Fixed + test |
| 3 | "Rejection reason" input is placeholder-only in 4 dialogs (HoursLogDialogs, LeavePage, TeamManagementPage, TLApprovalDashboard); TeamLeaderDashboard already labelled | grep `placeholder="Rejection reason"` | MEDIUM (a11y) | Fixed + test |
| 4 | Employee Overtime/Standby tables cannot be filtered by status; hidden filter would otherwise leave bulk selection on hidden rows | `OvertimePage.tsx`/`StandbyPage.tsx` use `HoursLogDataTable` with no status control | MEDIUM | Fixed: `FilterChipRow` with counts in `HoursLogDataTable`, selection cleared on change, test |

Disproved / already fine: TL approvals already have multi-select, bulk approve/reject and a ConfirmDialog; no `window.confirm`/`prompt` elsewhere in app code except organigrama builder (`OrganigramaBuilderPage.tsx:370`, `alert()` x4 in organigrama).

Deferred backlog (not verified or out of smallest-diff scope):
- Organigrama `window.confirm`/`alert()` (plugin; needs ConfirmDialog + toast).
- `UploadDropzone` (onboarding) has `role="button"` and no `onKeyDown` (may rely on inner input; unchecked).
- LeavePage and TeamManagementPage status filtering, TL stat cards `pressed` state (cards jump rather than toggle, so pressed does not fit).
- Reject reason is optional server-side (`allow_blank`); UI labels differ ("required" only on TeamLeaderDashboard).
- Server paging for employee tables: data is date-range scoped, no evidence of scale problem.
- 375/1440px layout, light/dark captures per `.devin/context/12-VISUAL-VERIFICATION.md`.
