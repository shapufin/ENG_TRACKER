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

## HR + Admin dashboards (audit 2026-10-31, `docs/reviews/2026-10-31-hr-admin-dashboard-audit.md`)

All findings from this audit are fixed on `audit/hr-admin-dashboards-2026-10-31` (commits
`1b45ea4`, `342a022`, `ae24dab` and the follow-up passes): the HR dashboard reads the `hr_overview`
widget endpoint, the personal dashboard's recent lists no longer empty on the 1st of a month,
`e2e/hr-dashboard.spec.ts` pins the wiring against the real API, and pure HR can now read the org
overtime/standby queue (`HrOnlyBlockedMixin.hr_read_actions`, SAFE_METHODS only). Nothing remains
open for this feature.

## Open items

### App-wide audit (2026-10-31, `docs/reviews/2026-10-31-app-audit.md`)

| Item | Severity | Fix sketch |
|---|---|---|
| `find_orphans` (`GET users/teams/orphans/`) returns four unbounded lists | LOW | company-scale data is small and a cap would hide rows; add pagination (and page UI) only if a real deployment outgrows a single response |
| Three older `plural` copies remain (`lib/adminInsights.ts`, `plugins/tl_scorecard/components/hbpr/hbprMeta.ts`, `plugins/tl_scorecard/components/team/TeamMemberDetailPanel.tsx`) | LOW | import `lib/plural.ts` and delete the local copies when those files are next touched |
| HR "Workforce" StatCard uses the destructive tone (red) for a neutral headcount | LOW | design-system tone decision: use a neutral/info tone once the HR card palette is reviewed |

### Maintenance mode (round 3, 2026-10-28)

| Item | Severity | Fix sketch |
|---|---|---|
| Branding changed through Django admin leaves the cached maintenance payload stale for ≤ 60 s (`SiteBrandingViewSet` clears the cache, `SiteBrandingAdmin.save_model` does not) | LOW | move `clear_maintenance_cache()` into `SiteBranding.save()` so every write path invalidates, and drop the two viewset calls; test: warm the status cache, save the row via the ORM, status reflects the new name |
| "Save message" while the switch is off toasts "Maintenance mode is off", which reads like nothing was saved | LOW | branch the toast on the mutation variables: no `is_active` → "Maintenance copy saved" |

### Login throttling behind a shared NAT (2026-11-02, found verifying `/calendar`)

| Item | Severity | Fix sketch |
|---|---|---|
| `AnonRateThrottle` (`anon: 100/hour`, `config/settings.py`) applies to **every** unauthenticated request, and `POST /api/auth/token/` + `/api/auth/token/refresh/` are unauthenticated. DRF runs all throttle classes, so the already-declared `throttle_scope = 'auth'` (`20/min` outside DEBUG, `apps/users/views/auth.py` lines 60 and 464) does **not** replace it — the 100/hour anon budget is the binding limit. An office behind one NAT IP (or many clients refreshing together) can trip it, and DRF's answer is a raw `"Expected available in N seconds."` 429 with no user-facing explanation. Dev runs hit it constantly: a 27-login Playwright suite exhausts the hour. | MEDIUM (production, unverified at real login volume) | measure real token/refresh requests per IP per hour first (nginx log + `INGRESS_REAL_IP_HEADER`); then exclude the auth paths from `AnonRateThrottle` and rely on the `auth` scope with a realistic burst rate, and map the 429 to explicit copy ("too many attempts — try again in a minute") instead of the raw countdown. Do not simply raise `anon` for everything: it also protects unauthenticated reads. |

