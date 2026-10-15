# Review: production-readiness / perf PR (#117, `b4d48ac`)

Branch: `review/perf-optimization-audit-2026-10-15` (from `origin/main`, upstream unset so it cannot push to `main` by accident).
Scope: 150 files, non-test code read in full for backend perf/security changes, deployment config, and the frontend runtime files. Tests and CI workflows skimmed only.

## Verified clean
- `check` and `makemigrations --check`: no issues, no drift.
- 53 targeted tests pass (perf budgets, escalation, scorecard, payroll list, notification pagination).
- Removed indexes are all redundant: `MonthlyKPI(user, month)` is covered by `unique_together`, `PayrollLine(run, user)` by its `UniqueConstraint`, FK columns (`team`, `client`, `user`) keep their implicit index.
- `PayrollRunViewSet.line_count_annotated` is scoped with the same `_allowed_payroll_user_ids` as the serializer (the "parent scope is not child scope" invariant holds).
- `get_current_user()` lazy lookup is sound: DRF's `Request.user` setter writes back to the `HttpRequest`.
- `update_user` `@transaction.atomic` + `set_rollback(True)` on the 400 paths is correct.
- Frontend does not call `/teams/{id}/members/`, so the new member scoping breaks no UI flow; notification badge uses `unread_count`, so the 100-row page cap does not skew it.

## Findings (ranked)

Status: M1, M2 (documented in `docs/deploy/production-runbook.md`), L1, L3, L4 fixed on this branch with tests. L2 and L5 left as-is (intended behaviour / release notes).

### M1. nginx `/api/` rate limit can become one shared bucket
`frontend/docker/nginx.conf.template`: `limit_req zone=api burst=40` is keyed on `$binary_remote_addr` (20 r/s). `$remote_addr` is only the real client when `real_ip_header CF-Connecting-IP` is honoured. The PR's own comment says the stack no longer ships a tunnel and any reverse proxy may sit in front. If that proxy is not on `set_real_ip_from`, every user shares the proxy IP, so ~50 people loading dashboards (a dozen requests each) will get 429s.
Action: before go-live confirm the ingress sets the header nginx trusts; otherwise raise the rate or key the zone on the forwarded client IP. Add a line to the runbook.

### M2. Redis `IGNORE_EXCEPTIONS` also swallows invalidation
`config/settings_production.py`: during a Redis outage `cache.delete` / version bumps are silently dropped, so permission cache and `dashboard:*` entries written before the outage can outlive a revoke once Redis returns (until TTL). The PR documents only the throttle fail-open. Action: document it, and consider a short TTL on the permission cache or flushing it on recovery.

### L1. `send_push_notification` catches only `RequestException`
`plugins/notifications/push_service.py`: other errors (bad VAPID key, `ImproperlyConfigured` when `VAPID_REQUIRE_ENV` and keys unset) now propagate. The signal path wraps it in `_push_best_effort`, but any other caller would 500. Without VAPID env, every push-enabled notification also logs a full traceback via `logger.exception`.
Action: grep other callers; catch `ImproperlyConfigured` in the wrapper and log one warning.

### L2. Data importer now rejects more files
`plugins/data_import/upload_validation.py`: a `.csv` containing a NUL byte is rejected, so UTF-16 "Unicode text" CSVs from Excel fail with "File content does not match its extension". Extensions other than csv/xlsx/xls (e.g. `.txt`, `.tsv`) were previously accepted by the content-sniffing fallback in `read_tabular_file` and are now refused. Probably intended; mention in the importer help text.

### L3. `escalation_candidates` still uses `date.today()`
`plugins/tl_scorecard/services.py`: this PR edited the function but left the server-local date, while the project rule is one Tirane "today" helper (`tirana_today`). Pre-existing, one-line fix.

### L4. Dockerfile stray continuation line
`Dockerfile` collectstatic `RUN`: removing `ENABLE_API_DOCS=False` left a line containing only `\`. Valid, but BuildKit warns about empty continuation lines. Delete that line.

### L5. Behaviour changes worth a release note
- `reset_password` now enforces `AUTH_PASSWORD_VALIDATORS` (was length >= 6), blacklists the target's outstanding refresh tokens, and only a superuser may reset staff/superuser accounts. The admin reset dialog should show the returned `messages`.
- `TeamSerializer.team_leader` no longer returns email/flags/roles; the TS type `Team.team_leader: User | null` is now wider than the payload (only id/name fields are read today).
- `ticket_kpi` link `review_status` is read-only through the serializer (create sets `confirmed`; review action writes it directly), which is consistent.

### Info
- `_user_has_related` with the `Prefetch(... .only(...))` loads every report row of each TL on the page instead of an EXISTS; fine at current scale, revisit past a few hundred reports per TL.
- Gunicorn 26.x exists on PyPI (checked), so the pin is valid.

## Not covered
Full backend suite (2774 tests), `GlobalSettingsPage.tsx` (697 lines, reviewed in #116), CI workflow YAML, e2e specs, browser verification.
