# Ticket KPI: stabilise, leader upload, graphs, per-team import (plan)

Status 2026-11-18 (end of day): P0, P1, P2, P3 and P5 are built and verified (backend 5105 tests, frontend 4461, browser pass at 1440/768/320 on dummy data, light and dark); work is on branch `feat/ticket-kpi-stabilise`, uncommitted. P4 (per-team import format, Backup first) is NOT started: it waits for the owner's export and column list (D10). Still open: per-row import action in the team table, "imported by" in the Ticket Review table, accessibility audit and design-critic pass, e2e Playwright specs not run. Approved by owner (D1-D9). Written from `docs/audits/ticket-kpi-2026-11-18/round-1.md`.
Execution: `superpowers:executing-plans`, one branch per phase (`feat/ticket-kpi-<phase>`), TDD, no commit without request.
Finding ids (B1..B11, F1..F7) refer to the audit file.

```xml
<plan id="ticket-kpi-2026-11-18" base="main@35bc2e81">

  <goals>
    <goal id="G1">A Manager or Line Manager imports the monthly ticket file for a member of their own squad, from the member's page or the team page, reusing the existing upload flow (month, profile, clients, preview, mapping fix).</goal>
    <goal id="G2">Ticket charts and filters show correct numbers and read well: statuses normalised, no fake zeros, top-N categories, client and status filters.</goal>
    <goal id="G3">Stabilise what exists first, so tomorrow's changes sit on a verified base.</goal>
    <goal id="G4">Every phase is checked against all plugins and Site Backup/restore.</goal>
  </goals>

  <outcome>
    <criterion id="C1">A leader upload for a non-member, a Manager, or another leader's member is refused (403) and writes no row; pinned by tests that fail before the change.</criterion>
    <criterion id="C2">For any month, open + closed + cancelled + other equals total tickets, whatever the status wording; pinned by a test with Done/Completed/Solved/closed complete.</criterion>
    <criterion id="C3">Backup then restore of a leader-uploaded batch gives the same owner, uploader, tickets and MonthlyKPI; guard test updated.</criterion>
    <criterion id="C4">Frontend gate: vitest + eslint + tsc for touched files green, and the Frontend gate of docs/workflow-invariants.md clicked in the browser on dummy data (Playwright Chrome must be installed first; until then visual claims stay UNMEASURED).</criterion>
  </outcome>

  <decisions status="recommended defaults, user may change before Phase 2">
    <decision id="D1" topic="entry point">Both: "Import for member" button on the member dashboard (replaces the hidden Import button of the filtered view) and a row action on the Team Performance member table. Both open /ticket-kpi/upload with a for-member query parameter. One page, one flow, a banner "Importing for NAME".</decision>
    <decision id="D2" topic="who may target whom">Admin/superuser: any non-superuser. Manager or Line Manager: only members returned by the existing roster helper (link-only, Managers excluded, self excluded from the on-behalf path). HR, HBPR, plain employees: never.</decision>
    <decision id="D3" topic="owner and provenance">Batch owner stays the member (user), so dashboards, overtime links, leader moves and exports follow the existing scope. New nullable uploaded_by FK (SET_NULL) records who imported; shown in Recent uploads and the Ticket Review table; one audit_log row per on-behalf import.</decision>
    <decision id="D4" topic="existing month">Employee keeps today's rule (admin only overrides). A leader may replace a member batch only while it is unreviewed, same rule as the existing delete; reviewed batches stay admin only.</decision>
    <decision id="D5" topic="review">A leader upload is NOT auto-reviewed; the leader reviews through the existing review action. Nothing about "reviewed" changes.</decision>
    <decision id="D6" topic="client rule">On behalf: selected clients must be inside the MEMBER's assigned clients and the profile's assigned clients, active only. Self-upload keeps today's rule except B3 (see Phase 1).</decision>
    <decision id="D7" topic="notify member">Audit row only in the first pass (YAGNI). A member notification is a separate, optional step if the owner asks.</decision>
    <decision id="D8" topic="clients are required (owner ruling 2026-11-18)">A plain employee (default user, no leader/admin role) without an assigned client cannot import for themselves, and a leader or Manager cannot import for such a member. Line Managers already have clients and follow the same rule for their own imports. Admin/superuser stay exempt; no rule is added for a Manager's own client list (unknown, future).</decision>
    <decision id="D10" topic="only the chosen columns (owner request)">A profile maps only the columns the team needs. P4 adds an optional keep-list per profile so raw_data stores just those columns plus the mapped ones, not the whole wide export; without a keep-list behaviour is unchanged (all columns stored). Reason: smaller rows, faster recompute, and breakdowns stop listing dozens of useless fields.</decision>
    <decision id="D8-ui" topic="D8 frontend">The frontend no longer treats "no assigned clients" as "all clients"; it shows an empty state telling the person to ask their Line Manager to assign a client (Settings, Client Assignment). Replaces today's bypass (B3).</decision>
    <decision id="D9" topic="unknown statuses (owner delegated, best option chosen)">An unmapped status never blocks the import. It is counted as "Other" in the KPI (open + closed + cancelled + other = total), and the preview lists each unmapped value with its row count and a one-click "map to open/closed/cancelled" that feeds the existing mapping-fix and save-to-profile flow. Reason: blocking would stop a whole month for one odd word; silent dropping is what causes B1.</decision>
  </decisions>

  <confirmed>Owner confirmed D1-D7 on 2026-11-18 (leader may replace a member batch while unreviewed). D8 and D9 added from the owner's answers.</confirmed>

  <phase id="P0" name="Branch and baseline">
    <steps>
      <step>Create feat/ticket-kpi-stabilise off main. Untracked scratch files in the repo root stay untouched.</step>
      <step>Run plugins.ticket_kpi, plugins.site_backup, apps.plugins, apps.permissions row-ownership tests; record counts as the baseline.</step>
      <step>Run frontend vitest for src/plugins/ticket_kpi; record counts.</step>
      <step>Install Chrome for Playwright so render gates can run (npm install; npx playwright install chrome).</step>
    </steps>
  </phase>

  <phase id="P1" name="Stabilise what exists (G3)">
    <files>
      plugins/ticket_kpi/analytics.py, mapping_engine.py, signals.py, viewsets.py (small edits only), new test file test_stabilise.py;
      frontend: pages/hooks/ticketKPIDashboardHelpers.ts, useTicketKPITeamPage.ts, KPITrendChart.tsx
    </files>
    <steps>
      <step id="P1.1" finding="B1">Test first (fails): a month of tickets with mixed status wording gives counts that sum to total. Then one normalisation function (raw status to open/closed/cancelled/other using profile transforms, defaults, keyword fallback) used by the importer; store the normalised value, keep the raw one in raw_data. Unknown statuses become "Other" (D9); the preview returns an unmapped_statuses list (value, row count) and the preview panel shows it with the map-to action. Add the "other" count only if a column is needed; otherwise derive from by_status. Run recompute_kpis (dry run first) to repair stored rows.</step>
      <step id="P1.2" finding="B5">Test first: a Line Manager cannot open dashboard, review or delete a linked Manager's data. Make the single predicate used by drill-down and review equal to the roster helper.</step>
      <step id="P1.3" finding="B3" decision="D8">Test first: a non-admin with zero assigned clients gets 403 on import (and the preview), a user with clients cannot tag one outside theirs. Frontend: empty state instead of "all clients" (TicketUploadPage.tsx:41-46). Check existing tests and the e2e seed for users without clients and give them one.</step>
      <step id="P1.4" finding="B4,B8">Return a fixed message for parse failures (log the exception), 400 not 500 for a bad file, accept a JSON boolean for override.</step>
      <step id="P1.5" finding="B6">Suggest a profile only when at least a minimum number of columns match; otherwise return none and let the user pick.</step>
      <step id="P1.6" finding="B7,B9">Recompute KPI on post_save only when created or when month/user/is_overridden changed (update_fields check); add the raw guard to the delete receiver. Test: reviewing a batch runs zero KPI recomputes.</step>
      <step id="P1.7" finding="F1,F6">Backend returns null for months without data; chart leaves a gap (connectNulls off) and the tooltip says "No data". Month and year defaults come from currentBusinessMonthKey().</step>
      <step id="P1.8" finding="B11">Read user_deletion for TicketImportBatch behaviour and write down the result; add a pinning test only if the behaviour is wrong.</step>
    </steps>
    <test-points>Targeted: plugins.ticket_kpi, vitest src/plugins/ticket_kpi. Pinned by C2 and the scope tests. Full suite once at the end of the phase.</test-points>
  </phase>

  <phase id="P2" name="Leader upload (G1)">
    <files>
      backend: plugins/ticket_kpi/models.py (uploaded_by) + migration, new module upload_scope.py (target resolution + rules, so viewsets.py does not grow), viewsets.py (thin calls in preview and import_batch), serializers.py, new tests test_leader_upload.py;
      frontend: TicketUploadPage.tsx, UploadForm.tsx, TicketKPIHeader.tsx, TicketKPITeamMemberTable.tsx, ticketKPIService.ts, lastUploadSelection.ts, types
    </files>
    <steps>
      <step id="P2.1">Tests first (all fail now): leader uploads for own member (201, owner=member, uploaded_by=leader, audit row); for another leader's member, a Manager, self-as-on-behalf, HR, employee (403/404, no row); closed-month overlap with an existing batch per D4; client rules per D6; override by leader only while unreviewed.</step>
      <step id="P2.2">Migration: nullable uploaded_by, SET_NULL, no default; then migrate the dev DB and confirm showmigrations has no unapplied ticket_kpi row.</step>
      <step id="P2.3">Backend: optional target_user_id on preview and import_batch only (analyze stays file-only). upload_scope resolves the target once and returns the batch owner; existing-batch lookup, client validation and the saved-mapping ownership check all use the resolved values. A missing or unreadable target answers 404, an out-of-scope one 403, never a different code per reason that would leak existence.</step>
      <step id="P2.4">Serializer: expose uploaded_by_name; Ticket Review table and Recent uploads show "Uploaded by X" only when it differs from the owner.</step>
      <step id="P2.5">Frontend: reuse TicketUploadPage with the for-member parameter; load the member's profile for name and clients through the existing user query; client list = member's clients; remembered selection key includes the target; page title and banner name the member; query keys include the target.</step>
      <step id="P2.6">Frontend: show Import for member only when the viewer is a leader of that member (backend stays the authority); hide for Managers' own rows.</step>
    </steps>
    <test-points>C1, C3. Backend: plugins.ticket_kpi, test_team_moves (a move after upload keeps scope), apps.permissions row-ownership. Frontend: page test for banner, client list, key isolation; browser click-through as Line Manager, Manager, employee, HR on dummy data (upload, preview, remap, import, review, delete, export).</test-points>
  </phase>

  <phase id="P3" name="Graphs and filters (G2)">
    <note>Run /frontend-design:frontend-design for the visual direction before writing components; reuse tone and chart tokens, DataTable, FilterToolbar, Chip, EmptyState; no new package.</note>
    <steps>
      <step id="P3.1">Backend: one dashboard payload option for client and status filters (client filter through batch.clients, so it works on stored data); keep by_* shapes backward compatible.</step>
      <step id="P3.2">Category chart: sorted horizontal bars, top 8 plus "Other", counts and percent; priority and status charts from the same data; empty-state copy.</step>
      <step id="P3.3">Trend: tickets as bars, p50 and p90 as lines on one clear axis, mean optional; gaps for empty months; 6 or 12 month switch.</step>
      <step id="P3.4">Filters: Chip row for client and status above the charts, URL-synced, included in React Query keys.</step>
      <step id="P3.5">Gates: control-audit and surface-audit scripts, a11y (labels, keyboard, tooltips not the only carrier of values), 320 px layout, light and dark.</step>
    </steps>
    <test-points>Helper unit tests for top-N grouping and null gaps; vitest for filter state; browser pass with real clicks.</test-points>
  </phase>

  <phase id="P4" name="Per-team import format, Backup team first (G2, later)">
    <blocked-on>From the owner, later: the Backup team export (anonymised) AND the short list of columns to map. Only that list is parsed and stored (D10); the rest of the wide export is ignored.</blocked-on>
    <steps>
      <step id="P4.1">Model the team format as an ExportProfile (already has mapping, transforms, required fields, clients). Decide whether a team link is needed or a naming convention plus assigned clients is enough (brainstorm with the sample in hand).</step>
      <step id="P4.2">Add a strict mode per profile: exact required headers, a column diff in the preview ("missing", "unexpected"), no silent fallback.</step>
      <step id="P4.3">Sample template download per profile (CSV with the exact headers), so a leader or member fills the right shape.</step>
      <step id="P4.4">Seed command for the Backup profile with transforms; a mapping regression test built from the sample.</step>
    </steps>
  </phase>

  <phase id="P5" name="Cross-plugin, backup and docs (G4)">
    <steps>
      <step>Run: plugins.ticket_kpi, plugins.site_backup (coverage guard, restore tests), apps.plugins (isolation, HBPR denial, boot path), apps.permissions row-ownership matrix, engagement and tl_scorecard leader-move tests, core leader-seam guard.</step>
      <step>Backup: extend test_backup_coverage_guard with uploaded_by; add a restore round trip for a leader-uploaded batch (owner, uploader, tickets, KPI); confirm no signal runs on raw saves; restore into a blank DB headless with restore_site_backup.</step>
      <step>Docs in the same PR: docs/workflow-invariants.md item 69 extended (on-behalf upload rule, owner stays member, uploaded_by, roster predicate), CLAUDE.md hot invariant and router row, .devin context 03-ticket-kpi.md, docs/site-backup-and-restore.md, role-movement-checklist (new leader-authored action). Grep the repo for the old wording "contact an administrator to override" and fix hits.</step>
      <step>Run the full backend and frontend suites once, ruff, tsc, build; compare with the P0 baseline.</step>
    </steps>
  </phase>

  <ux-gates applies-to="P1.7, P2 frontend, P3, P4 preview" owner-request="make it visually better, 2026-11-18">
    <design>Before building a screen run /frontend-design:frontend-design and write a short visual direction (hierarchy, one leading element, states). Reuse tokens and shared primitives only: StatCard, GlassCard, DataTable, Chip/FilterChipRow, FilterToolbar, EmptyState, ConfirmDialog, tone and chart tokens. No raw hex, no emoji, no new package.</design>
    <states>Every changed screen has loading (skeleton), empty (with next action), error, partial-data and no-permission states; the on-behalf banner, no-client empty state and unmapped-status list are designed, not afterthoughts.</states>
    <static-gates>cd frontend: node scripts/control-audit.mjs, surface-audit.mjs, modal-audit.mjs, table-header-audit.mjs (+ their node --test files); eslint and tsc on touched files; design lint_hardcodes, check_no_emoji, validate_contrast.</static-gates>
    <a11y>/a11y-audit on upload, dashboard and team pages: labels on every control, keyboard path for filters and chart toggles, chart values also available as text or table (tooltip is never the only carrier), target size 24 px, focus visible, reduced-motion safe.</a11y>
    <render-gates>Light and dark at 1440, 768 and 320 px; scrollWidth equals clientWidth (no overflow); contrast measured. Requires Chrome for Playwright (P0 step 4); if not installed, report UNMEASURED, never pass.</render-gates>
    <click-gate>Real clicks on dummy data per the Frontend gate in docs/workflow-invariants.md: pick month and member, upload, preview, remap, import, review, delete, filter charts, export; zero console errors, all requests 2xx. Roles: employee, Line Manager, Manager, HR, admin.</click-gate>
    <critic>After gates are green run /design-review and the ux-ui-agent-skills:design-critic agent on the charts and the upload page; fix HIGH findings before the phase closes.</critic>
  </ux-gates>

  <risks>
    <risk>Scope bug on the new path is the one security-relevant change: every target check lives in one function with tests per role.</risk>
    <risk>Status normalisation changes stored numbers: dry-run recompute and a before/after count are shown before applying.</risk>
    <risk>Migration must be applied to db.sqlite3 and the e2e DB; an unapplied column shows as OperationalError, not a code bug.</risk>
    <risk>Render gates are unmeasured until Chrome is installed for Playwright.</risk>
  </risks>

  <open-questions>
    <q id="Q1" status="resolved">D1-D7 confirmed.</q>
    <q id="Q2" status="resolved">Clients required for employees (D8).</q>
    <q id="Q3" status="resolved">Unknown statuses count as Other and are surfaced in the preview (D9).</q>
    <q id="Q4" status="open">Backup team: owner will send the export later, together with the short list of columns to map (the export has too many columns; we map only that list). Nothing in P4 starts before then.</q>
    <q id="Q5" status="resolved">D8 applies to plain employees only (default user, no leader or admin role). Line Managers have clients assigned, so they upload under the same client rule. Managers get upload access for on-behalf imports; Manager-specific client rules are unknown and deliberately not built (YAGNI): a Manager's on-behalf import is checked against the MEMBER's clients, never the Manager's.</q>
  </open-questions>

</plan>
```
