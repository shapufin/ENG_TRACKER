# Tracked Backlog

Deferred, non-blocking work items from full audits and reviews. **Keep this file current**:
when an item is picked up, move it to "In progress" with the branch; when fixed, delete it and
note the fix in the audit record it came from. Anything recorded here is a deliberate decision
NOT to fix now — do not re-report it as a new finding.

## Maintenance mode (audit 2026-10-28, `docs/reviews/2026-10-28-maintenance-audit.md`)

All ten LOW findings from the round-1 audit were fixed in the same pass (commits `cef7524`,
`e547593`, `33cadb6`, `4a68374`, `62d4f1e`, `7845078`, `91c3231` on
`audit/maintenance-2026-10-27`). Nothing remains open for this feature.

| Was | Fix |
|---|---|
| `site_name` blank validation | blank stored name falls back to the default (`cef7524`) |
| `SiteBranding` query per status poll | branding is part of the cached state; a warm status GET costs 0 queries (`cef7524`) |
| Self-heal `UPDATE` bypassed `save()` | the heal bumps `updated_at`; per-worker cache lag ≤ 60 s TTL stays by design (`cef7524`) |
| MFA steps didn't map the maintenance 503 copy | `handleStepError` maps it (`e547593`) |
| Copy while off lived only in component state | "Save message" works while off; a copy-only PATCH preserves a pre-staged `ends_at` (`cef7524` backend, `33cadb6` UI) |
| Banner only in AdminShell | mirrored into `AppShell` (`4a68374`) |
| Double mount animation | `GlassCard animateOnMount={false}` (`62d4f1e`) |
| Stale `.devin/context/13-MAINTENANCE.md` | refreshed (local-only file; the tracked source is workflow-invariants item 37) |
| Raw action codes in the plugin audit UI | `maintenance_on/off/blocked` choices added to `plugins.audit_log` (`91c3231`) |
| Raw action codes in RecentActivityWidget | prefers `action_display`, falls back to the raw code (`7845078`) |

## Open items

None.
