# Maintenance mode — audit record (2026-10-28)

Full audit of the site-wide maintenance implementation (feature commit `088cb0d`), fixes on
`audit/maintenance-2026-10-27`. Scope: `core/maintenance/*`, the dashboard model/service/view/
serializers/admin/migration, the four auth guards, settings, and the frontend gate/page/card/
banner/hook/service plus the api/AuthContext/QueryContext wiring. Risk-ranked auth-first.

## Result

0 CRITICAL / 1 HIGH / 4 MEDIUM / 10 LOW found; **all fifteen fixed** — the five HIGH+MEDIUM
test-first, the ten LOW in the follow-up backlog pass. Five claims were disproved during
verification (see `.devin/audits/maintenance-2026-10-27/round-1.md` for the full tables —
local-only, not tracked). Deferred items now live in the tracked `docs/backlog.md`.

## Fixed

| Finding | Severity | Fix | Test |
|---|---|---|---|
| Proactive token refresh aborted the maintenance status GET for near-expiry tokens, so the maintenance screen could fail to appear | HIGH | `4ab5da7` — the interceptor skips the proactive refresh for `/dashboard/maintenance/` (the endpoint ignores auth) | `api.maintenance.test.ts` "does not let the proactive refresh abort the maintenance status call" |
| Countdown was a `role="status"` + `aria-live="polite"` region re-rendering every second | MEDIUM | `6665112` — ticking value `aria-hidden`, live region on the static "Around \<deadline\>" line | `MaintenancePage.test.tsx` "does not announce the ticking value to screen readers" |
| Maintenance refusals were audited as `LOGIN_FAILED` (a window of refusals read like a brute-force burst) | MEDIUM | `6b2d808` — distinct `MAINTENANCE_BLOCKED` audit action (+ choice migration 0008 + filter option) | `test_maintenance_refusal_is_not_recorded_as_a_failed_login` |
| The durable invariants lived only in gitignored `.devin/` | MEDIUM | `ef32c99` — `docs/workflow-invariants.md` item 37 | docs |
| Django admin could arm the switch without `started_at`/`ends_at`, dropping the auto-expire safety net | MEDIUM | `90397f2` — the Django-admin form is read-only; the admin GUI stays the single write path | `test_django_admin_cannot_change_the_switch` |

## Gates after the fixes

Backend **3828 OK** (baseline 3823 + 5 new), `makemigrations --check` clean, ruff clean; frontend
**3821 tests / 600 files** (baseline 3815 + 6 new), tsc/eslint/prettier clean, surface-audit PASS
(0/960). Browser post-fix: ticking value hidden from assistive tech, live region carries only the
static deadline, no horizontal overflow at 1440px or 375px, light + dark evidence captured.

## Backlog

All ten LOW findings were fixed in the same pass — see `docs/backlog.md` (the tracked backlog
file) for the item-by-item fix map and the commits. Nothing remains open for this feature.

## Process notes

- Scope exception, reported: the `AuditLogFilters.tsx` filter option rode in the backend commit
  `6b2d808` — the action and its filter label are one logical unit.
- One `style:` commit (`ea85e02`): formatting-only follow-up after the files were recreated from
  session context (see the incident note in the local round-1 file).
