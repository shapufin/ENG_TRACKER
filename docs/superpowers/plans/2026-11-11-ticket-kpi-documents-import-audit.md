# Ticket KPI: Documents, Import Tickets, Line Manager squad view

> For agentic workers: use superpowers:executing-plans or subagent-driven-development. Branch: `audit/ticket-kpi-2026-11-11`. TDD, one commit per task.

**Goal:** Rename Evidence to Documents and Upload to Import Tickets, give Line Managers a squad-wide Documents view, align the scope check, polish theme.
**Spec:** the `/full-audit` Gate 1 table (approved incl. LOW), `.devin/context/PLUGINS/03-ticket-kpi.md`.

## Global Constraints
- Label-only rename: API paths, `KPIEvidence`, query keys, file names, migrations unchanged. Core overtime `evidence` is out of scope.
- Team scope only via `get_team_member_ids()` (`_get_tl_team_members`); Managers excluded; employees see self only.
- Tone tokens only (`toneFillClass`), no raw palette, no emoji, no `dark:` colours.
- Baseline: frontend ticket_kpi 103 pass; backend `plugins.ticket_kpi` exit 0.

## Review Focus
- LM opens a document of a Manager in their link set: list hides it, detail must too (same helper).
- Squad list for LM with zero members: empty state, no 403.
- Employee `?user_id=` of a colleague: 404/empty, never rows.
- 280px: documents cards and squad filters must not overflow.
- Pending badge count must match the filtered list.

## Files
- Modify: `plugins/ticket_kpi/viewsets.py` (`KPIEvidenceViewSet`), `test_ticket_kpi.py`
- Modify: `evidence/{TicketKPIEvidenceSection,EvidenceList,EvidenceItem,EvidenceUploadForm,EmailThreadViewer}.tsx`
- Modify: `TicketKPIHeader.tsx`, `TicketKPIDashboardPage.tsx`, `TicketUploadPage.tsx`, `TicketKPITeamManagementPage.tsx`, `TicketKPITeamPage.tsx`, `useVisibleNavItems.ts` (+ their tests)
- Create: `components/evidence/TeamDocumentsPanel.tsx` (+ test)

## Task 1: Backend scope alignment + wording
- [ ] Failing tests: LM GET/PATCH/review of a Manager's document is 404/403 like the list; employee `?user_id=` other user returns none; messages say "document".
- [ ] `_check_evidence_permission` uses `_get_tl_team_members` membership, not `_is_tl_for_user`; reword all "evidence" messages.
- [ ] Run `py -3.14 manage.py test plugins.ticket_kpi`, ruff. Commit `fix(ticket-kpi): align document scope, reword messages`.

## Task 2: Rename Evidence to Documents (UI)
- [ ] Update tests first: section title "Documents", buttons "Add Document", dialog "Upload Document", aria-labels, empty states, type label "Document Type".
- [ ] Change strings only in the evidence components. Run vitest on `src/plugins/ticket_kpi`. Commit.

## Task 3: Import Tickets naming, placement, member view
- [ ] Tests: header button "Import Tickets"; hidden in filtered (member) view; empty-state action "Import Tickets"; nav label "Import Tickets" for `/ticket-kpi/upload` entry; page title "Import Tickets"; "Upload Management" becomes "Imports Review"; dialog "Delete Import".
- [ ] Apply in files above; update `useVisibleNavItems.test.ts`. Commit.

## Task 4: Line Manager squad Documents panel
- [ ] Test: panel lists squad documents with member, month and status filters, pending count, review actions, row click opens member dashboard.
- [ ] Build `TeamDocumentsPanel` reusing `EvidenceList`/`EvidenceItem` and `getEvidence({month, status})` (TL queryset already squad-scoped); add a "Documents" tab on `TicketKPITeamPage`. Commit.

## Task 5: Theme polish (LOW)
- [ ] Replace raw `bg-indigo/purple/blue/emerald-500` in `TicketKPITeamPage` with tone fill classes; align Documents cards to `GlassCard` and control kit chips.
- [ ] Run `node scripts/control-audit.mjs`, `surface-audit.mjs`, eslint, tsc. Commit.

## Task 6: Browser verification and docs
- [ ] Seed employee + LM + tickets + documents (script in scratchpad, not committed); screenshot employee and LM at 1440 and 280px; check console and network 2xx.
- [ ] Update `03-ticket-kpi.md`, write `.devin/audits/ticket-kpi-2026-11-11/round-1.md`; full backend + frontend suite once. Commit.
