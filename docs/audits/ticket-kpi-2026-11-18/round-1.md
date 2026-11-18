# Ticket KPI plugin: audit round 1 (plan-only, no code changed)

Date 2026-11-18. HEAD `35bc2e81` on `main`. Scope: `plugins/ticket_kpi` (backend), `frontend/src/plugins/ticket_kpi` (frontend), cross-plugin and Site Backup touchpoints.
Baseline: `py -3.14 manage.py test plugins.ticket_kpi` exits 0 (no failures). Full-suite baseline is the 5061 of the passkey merge; two `tl_scorecard` one-on-one tests and the frontend `npm audit` gate are red on `main` and are `pre-existing`, not ours.

Method and limits: every finding below was read in code (file:line). Browser gates did not run (no Chrome for Playwright, preflight said so), so every visual claim is `unverified-visual`. Finding status: `read` = seen in code, `test-first` = must be proven by a failing test in Phase 2 before any fix.

Risk ranking: wrong numbers on KPI dashboards (B1, F1) > access scope of the new upload (B2, B3, B5) > data hygiene and perf > polish.

## Surface

| Group | Items |
|---|---|
| Custom code | `TicketUploadViewSet` (analyze, preview, import_batch, delete, review), `TicketKPIDashboardViewSet`, `analytics.py`, `mapping_engine.py`, signals, upload page + form + preview panel, dashboard, team pages, charts |
| Shared | `PluginPermissionMixin`, `HrOnlyBlockedMixin`, `get_team_member_ids()`, `italian_tl_user_ids()`, `core/utils/tabular_file.py` |
| Out of scope (light) | KPIEvidence/Documents, overtime ticket links (only checked for interaction) |

## Findings

| # | Area | Issue | Severity | Status | File |
|---|---|---|---|---|---|
| B1 | Backend | `compute_monthly_kpi` counts closed and open by the literal strings `closed` and `open`. A status outside `DEFAULT_STATUS_TRANSFORMS` (Done, Completed, Solved, Fulfilled, any non-English term) stays raw, so closed and open both under-report and by_status splits on case ("Done" vs "done"). Team-specific exports break first. Seen once already: seeded capitalised statuses gave zero closed/open (mem 14259) | CRITICAL (wrong numbers) | read, test-first | analytics.py:101-102, mapping_engine.py:97-114, 383-406 |
| B2 | Backend | No leader upload path: batch owner is `request.user`, the existing-batch check and preview check use `request.user` | HIGH (feature gap, goal 1) | read | viewsets.py:453, 626, 657 |
| B3 | Backend | Client "defense in depth" check is skipped when the uploader has no assigned clients (`if user_client_ids:`), so such a user can tag any client. Owner ruling 2026-11-18: clients are required for employees (plan D8) | MEDIUM | read, test-first | viewsets.py:565-578 |
| B4 | Backend | analyze, preview and import return `str(e)` of any exception; import answers 500 for a bad file | MEDIUM | read | viewsets.py:381, 467, 613 |
| B5 | Backend | Scope drift: `_get_tl_team_members` removes Managers, `_is_tl_for_user` does not, so a member drill-down and review can reach a linked Manager's data | MEDIUM | read, test-first | viewsets.py:1494-1515, 1543 |
| B6 | Backend | Profile suggestion falls back to the newest active profile at score 0, so a wrong mapping is proposed silently | MEDIUM | read | viewsets.py:354-358 |
| B7 | Backend | Every `batch.save()` (review, bulk review) fires `compute_kpi_on_import`, a full recompute of the month (8 reviews = 8 recomputes) | MEDIUM (perf) | read | signals.py:16-34, viewsets.py:1531 |
| B8 | Backend | `override` read with `.lower()` on request data: a JSON boolean gives 500 | LOW | read | viewsets.py:481 |
| B9 | Backend | `delete_kpi_on_batch_remove` has no `raw` guard (the two other receivers do); a restore that deletes rows would run it | LOW | read | signals.py:38 |
| B10 | Backend | `viewsets.py` is 2376 lines; new upload logic must not go in there | MEDIUM (bloat) | read | viewsets.py |
| B11 | Backend | `TicketImportBatch` and `NormalizedTicket` are not named in the user-delete housekeeping test; how an erase treats a member's batches is unverified | unknown | needs check | apps/users/tests_app/test_user_delete_blockers.py:105 |
| F1 | Frontend | Trend charts plot `avg_resolution_hours ?? 0`, and the backend zero-fills empty months, so a month without data shows as 0 hours | HIGH | read, unverified-visual | ticketKPIDashboardHelpers.ts:22-27, useTicketKPITeamPage.ts, analytics.py:232-243 |
| F2 | Frontend | Category chart is a pie of every category (up to 200), unsorted, five colours that repeat, long legend. Priority and status are returned or stored but never charted | HIGH | read, unverified-visual | CategoryPieChart.tsx, buildCategoryChartData |
| F3 | Frontend | Dashboard filters by month only: no client filter (batches carry clients), no status or priority filter on charts | MEDIUM | read | useTicketKPIDashboard.ts |
| F4 | Frontend | Dual-axis area chart plots the mean (outlier-skewed) although p50/p90 exist | MEDIUM | read | KPITrendChart.tsx |
| F5 | Frontend | Upload page assumes the importer is the owner: clients come from `user.client_ids`, remembered selection is keyed by user, Import button hidden in a member view | MEDIUM | read | TicketUploadPage.tsx:41, TicketKPIHeader.tsx:56 |
| F6 | Frontend | Current month and year come from `new Date()`, not `currentBusinessMonthKey()` (invariants item 38) | MEDIUM | read | useTicketKPITeamPage.ts, TicketKPIDashboardPage.tsx:30 |
| F7 | Frontend | 12 rotated month ticks and legend at 280 px | LOW | unverified-visual | KPITrendChart.tsx |

## Cross-cutting

- One normalisation seam is missing: statuses, priorities and categories are normalised in the importer only, and analytics trusts it. Fix once in a single function, then recompute stored KPIs with the existing `recompute_kpis` command.
- Chart colours use `hsl(var(--chart-N))` with space-separated tokens: valid, not a finding.
- Per-team import formats exist only as free `ExportProfile` rows (`field_mapping`, `value_transforms`, `required_fields`, `assigned_clients`). There is no team link, no strict header check, no downloadable sample. This is the base for goal 2.

## Interaction with other plugins and backup

- Core and engagement hold no import of ticket_kpi (`test_core_coupling`). Engagement only copies the percentile definition.
- Overtime links search "own or managed batches": a batch owned by the member (leader upload) keeps working, because ownership stays `user = member`.
- `client_lifecycle` walks reverse relations: archiving a client is already blocked by batch links.
- Site Backup dumps all six ticket_kpi models and the media zip; the `raw` guards exist for create paths (B9 is the one gap). A new `uploaded_by` column rides along automatically.

## Deferred (backlog, not planned for the first pass)

Splitting `viewsets.py`; one recompute per import instead of two (documented, deliberate); framework-rendered shells; LOW polish beyond F7.

## Resolution (2026-11-18, branch `feat/ticket-kpi-stabilise`, not committed)

| Finding | Status | Where |
|---|---|---|
| B1 | fixed | `status_groups.py`, `analytics.compute_monthly_kpi`; preview lists `unmapped_statuses` |
| B2 | fixed | `upload_scope.py`, `target_user_id`, `uploaded_by` (migration 0015) |
| B3 | fixed (owner ruling: clients required for non-admins) | `upload_scope.client_access_error` |
| B4, B8 | fixed | fixed 400 message, `override` parsing |
| B5 | fixed | `_is_tl_for_user` excludes Managers |
| B6 | fixed | profile suggested only with at least two matching columns |
| B7, B9 | fixed | partial-save guard, `raw` guard |
| B10 | mitigated | new logic in `upload_scope.py`, `status_groups.py`; `viewsets.py` only gained thin calls |
| B11 | no issue | `user_delete_blockers` walks Django relations, batches already block a delete |
| F1, F6 | fixed | null months, Europe/Tirane month and year |
| F2, F3, F4 | fixed | ranked bars, status and client filters, median and slowest-10% lines |
| F5 | fixed | `?for=<userId>` flow |
| F7 | partly checked | 320 px has no sideways overflow; 280 px and light mode not run |

Open: Phase 4 (per-team import format, Backup team first) waits for the owner's export and column list. Render gates for light mode, 768 px and the accessibility audit are not run.

## Round 2 (2026-11-18, HEAD `ec5b6dbb`, branch `feat/ticket-kpi-stabilise`)

Re-read in code against every round-1 finding; none reappeared. Resolved items hold: B1 (`status_groups.py`, now also counts `Rejected` as cancelled, owner ruling), B2/B3/B5 (`upload_scope.py`), B6, B7/B9 (all three signal receivers carry a `raw` guard), B8, F1-F6. Remaining `?? 0` in the frontend are ticket counts, never hours.

New findings: none above LOW. One LOW (the two admin mapping-test endpoints, `test_mapping` and `auto_detect`, returned the parser's message in a 400) was fixed the same day with a fixed message and `logger.exception` (`test_stabilise.MappingToolErrorTests`).
Not run: Playwright e2e, the accessibility kit audit (kit not installed), 280 px width.
Scorecard: round 1 had 18 findings (1 critical, 3 high, 10 medium, 3 low, 1 unknown); round 2 has 0 open above LOW, 1 new LOW, 0 false positives.
Open by design: Phase 4 (per-team import format, Backup team first) waits for the owner's export and column list.
