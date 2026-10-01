# HBPR role and TL Scorecard completeness

Shipped 2026-10-01. This page is the operator and developer summary; the invariants
that must not regress live in `CLAUDE.md` ("HBPR" hot invariant) and
`.devin/context/01-PERMISSIONS.md` (local, gitignored).

## What HBPR is

`hbpr` is a database role for the HR business partner for Italy. It is **not** a team
leader and not HR. She partners with Italian TLs and their people and takes part in
PIPs, 1-on-1s and monthly meetings. She has no overtime, standby or payroll.

| Area | Behaviour |
|---|---|
| Scope | Computed, never stored (`apps/users/services/hbpr_scope.py`): active holders of `italian_tl` plus their `get_team_member_ids()` union. Inactive users and the viewer are excluded. One shared population for all HBPRs. |
| Reads | TL scorecard records and engagement snapshots for in-scope TLs, via `HbprReadScopeMixin` (owner TL in scope **and** subject in scope). |
| Participates | Approve or return a PIP, decide a promotion, write her own attendance notes. Never about herself; staff included in the self-block. No edit or delete of TL-owned records. |
| Blocked | Overtime, standby and reports return 403 for HBPR-only users (`HbprBlockedMixin`). Leave and Calendar stay. |
| Privacy | A TL's free-text `notes` stay private unless the HBPR attended or the TL shared them. The employee never sees promotions, idle flags, absences, drafts or private notes. |

## Employee side

`/my-records` (plugin `tl_scorecard`, flagged `self_service`) shows an employee shared
1-on-1 summaries, approved improvement plans and their EPR cycle. It is backed by a
fixed-whitelist endpoint (`GET /api/plugins/tl_scorecard/my-records/`), open to any
authenticated user because it only returns their own rows.

## TL Scorecard changes

- **Records tab** (`/tl-scorecard?tab=records&kind=<kind>&tl=<id>`): list, edit, delete and
  state actions for meetings, idle flags, absences, review deliveries, promotions and PIPs.
- **PIP state machine:** a new PIP is a `draft`; HR/HBPR approves (`active`) or returns it
  (`cancelled`, reason required); the owning TL completes or cancels an `active` plan.
  `status` is server-controlled. Plans saved before this change as `active` with no
  approval count as awaiting approval (`PIPRecord.awaiting_approval`).
- **Notifications:** eight scorecard types, generic wording (no names, notes or reasons),
  push off by default, sent after commit. Employees only get "new item in your records".
- **Exports:** the workbook no longer evaluates cell text as formulas.

## Operations

**Deploy:** `docker/entrypoint.sh` runs `migrate`, `sync_plugins`, then
`grant_hbpr_plugin_access`. Migrations added: `permissions` 0006 (role seed) and 0007
(plugin view grant), `tl_scorecard` 0003, `notifications` 0010; all additive.

**Grant:** `grant_hbpr_plugin_access` gives `hbpr` plugin `view` on `tl_scorecard` and
`engagement` once, only while `hbpr` holds no plugin grants. Manifest sync never edits
existing permission rows, which is why existing databases need it.

**Assigning the role:** Admin → Users → HBPR switch. `hbpr` is a managed role: every
`roles` list sent to `create_user` / `update_user` must include it or it is revoked
(the admin form always sends it). The data importer does not touch it.

**Engagement snapshots:** the first read of a month creates the visible TLs' snapshots.
`manage.py recompute_tl_metrics` still refreshes all of them.

**Seed / e2e:** `e2e_hbpr` (password in `seed_e2e_data.py`) is the HBPR fixture.

## Security note

The release also fixes a pre-existing hole: `create_user`, `update_user` and
`reset_password` on `UserViewSet` were callable by any authenticated user because
`get_permissions` overrode their admin-only classes. Any new admin `@action` there must
be added to the `IsAdminUser` list in `get_permissions`. Review production logs for
unexpected `update_user` / `reset_password` calls from non-staff accounts.

## Known limits

- The Records export is month-only (no year-to-date).
- No screen yet for an HBPR to write attendance notes (the endpoint exists:
  `POST meeting-attendees/{id}/notes/`).
- The user importer has no HBPR column.
