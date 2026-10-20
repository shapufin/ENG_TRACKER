# Production Readiness: Security, Performance, Deployment and Workflow Plan

> **For agentic workers:** Execute phase by phase, each in a fresh context, with `claude-mem:do` or `superpowers:subagent-driven-development`. Every phase is self-contained: read its **Required reading** first and follow its **Skills** list. Use checkbox (`- [ ]`) tracking. Track progress in claude-mem `work_state_write` (list `prod-readiness`), one item per phase. Commits and PRs follow the user's standing instruction for this session. If there is none, ask before committing (project `CLAUDE.md`: never commit unless explicitly requested).

**Goal:** Ship the Engineering Tracker (Django 6.1 + DRF, React/Vite, Postgres, Redis, nginx, Docker) to production with five things true:
- No known authorization hole or deployment misconfiguration.
- Measured query budgets on the hot endpoints.
- A CI pipeline that enforces all of the above.
- AI-workflow docs that match the code.
- Every user-visible change proven in a real browser.

**Architecture of the plan:**
- **Phase 0** is a verified findings register (already gathered on 2026-10-14 by four discovery passes plus orchestrator re-checks).
- **Phases 1-9** fix findings test-first, in risk order.
- **Phase 6** sweeps the parts of the backend the discovery did not read deeply.
- **Phase 10** is a production rehearsal through the real Docker/nginx stack.
- **Phase 11** is final verification.

**Tech:**
- Run Django commands with `py -3.14`. The default `python` is 3.11 + Django 5.2.
- Production is Python 3.12 + Django 6.1.1 + Postgres 16 + Redis 7 + gunicorn + nginx 1.27.

**Plan file location:** tracked (`docs/superpowers/plans/`) on purpose. `.devin/` is gitignored, and this plan must survive on other clones.

---

## Outcome

**Who / what after:**
- An operator can run `docker compose up` with a filled `.env`, put a TLS proxy in front, and get:
  - throttled auth
  - logs visible in `docker logs`
  - pooled DB connections
  - a resilient cache
  - scheduled backups
  - no PII baked into images
- Each role (employee, TL, HR, admin, superuser, CR admin, HBPR) sees only the data its scope allows, through every endpoint, export and media URL.
- Hot list endpoints have pinned query budgets.
- An AI agent loading `CLAUDE.md` gets correct, current instructions.

**Success criteria (checkable, each needs evidence):**
1. `py -3.14 manage.py check --deploy --settings=config.settings_production` (with the CI env block) reports 0 issues. It also passes a new test asserting every scoped throttle rate is non-`None` under production settings.
2. Every SEC-* finding marked *confirmed* has a regression test that failed before the fix and passes after. Proof: test names listed in the phase evidence block.
3. Every PERF-* N+1 fix has an `assertNumQueries` test proving the count does not grow with N.
4. `.dockerignore` contract test fails if `*.bak*`, `*.csv`, `migration/out/`, `graphify-out/`, `.opencode/`, `admin-gui-screenshots/` are not excluded. A built image contains none of them, verified with `docker run --rm <img> ls`.
5. CI runs the backend test suite on Postgres, the Playwright chromium suite, `modal-audit`, `dashboard-audit`, an image scan and a secret scan, and all are green.
6. `CLAUDE.md`, `docs/workflow-invariants.md` and `.devin/context/12-VISUAL-VERIFICATION.md` contain zero stale references from the DOC-* list (re-run the grep checks in Phase 9).
7. The browser Page Gate (§Browser verification protocol) passed for every page a phase touched, with screenshots and console/network evidence recorded in the phase evidence block.
8. Phase 10 rehearsal: the full compose stack boots on prod settings, `/api/health/ready/` returns 200 through nginx, each seeded role logs in through the browser, and a backup + restore drill succeeds.

---

## Pre-approved decisions and decision gates

No user answers exist yet for the items below. Each is a **gate**: the executor asks the user (AskUserQuestion, recommendation first) **before starting the named phase**. If the user is unavailable, apply the stated default and record it here.

| ID | Question | Recommendation / default | Blocks |
|---|---|---|---|
| D1 | Ingress: the `cloudflared` service was removed from `docker-compose.yml` (commit `9badfd7`), but README and plans still describe `--profile tunnel`. Re-add the tunnel, or document an external TLS reverse proxy? | Default: document an external proxy, and fix README to match. Do not re-add the tunnel unless the user asks. | Phase 4 |
| D2 | `PersonalOnlyFilterMixin`/`TeamLeaderFilterMixin` let a regular user who passes `workspace_ids` of any **public** workspace see all OT/standby/leave rows of that workspace's users (`core/mixins/permissions.py:716-728,869-874`). Intended (team-calendar transparency), or a leak? | Default: treat it as intended (calendar feature) but restrict the serializer to calendar-safe fields. Ask first. | Phase 2 (SEC-08) |
| D3 | Background task queue: none exists. Notification push, backups, exports and imports run in the request. Add RQ/Celery (a new dependency)? | Default: **no new dependency in this plan**. Use `transaction.on_commit` + push timeout + gunicorn timeout tuning, and document the queue as follow-up SR-01. | Phase 5 |
| D4 | Error monitoring: add `sentry-sdk` (new dependency, needs a DSN)? | Recommend yes, env-gated (no DSN means no-op). Needs user approval per CLAUDE.md "no new packages without permission". | Phase 4 |
| D5 | Notification retention: the notification list is unpaginated and never pruned. Retention window? | Default 180 days for read notifications. Unread are kept. | Phase 5 |
| D6 | CSP `'unsafe-inline'` in `script-src` (`frontend/docker/nginx.conf.template:110`). Remove now, or measure first? | Default: measure first. Ship a `Content-Security-Policy-Report-Only` with a strict `script-src` alongside the enforcing one, and decide after the browser sweep shows 0 violations. | Phase 4 |

---

## Phase 0: Documentation discovery (DONE 2026-10-14, output below)

Four read-only discovery passes covered deployment/infra, the backend security surface, backend performance, and workflow-doc freshness, plus orchestrator re-checks. **Phase 1 must re-verify any line number before editing.** Line numbers drift, so search by symbol, not by line.

### 0.1 Findings register

Severity: **H** high, **M** medium, **L** low. Status: **C** confirmed by orchestrator re-read, **R** reported with file:line by discovery but not re-read, **I** inferred (needs a test to confirm).

#### Security (SEC)
| ID | Sev | St | Location | Finding | Status (2026-10-20) |
|---|---|---|---|---|---|
| SEC-01 | H | C | `config/settings.py:35,215-220`, `config/settings_production.py:8,78-81` | `DEBUG` defaults to `'1'`. The scoped throttle rates (`auth`, `upload`, `export`, `evidence_upload`, `control_room`, `health`) are computed as `None` at import of the base settings. Production sets `DEBUG=False` *after* `import *` and spreads the already-computed dict, so **login brute-force throttling is off in production** unless a `DEBUG=0` env var happens to be set (compose sets none). `config/test_deployment.py:~111` checks only that the keys exist. | FIXED (`config.test_deployment.ProductionThrottleRatesTests.test_rates_set_when_debug_env_unset`) |
| SEC-02 | H | C | `plugins/ticket_kpi/viewsets.py:1928-1945` (`KPIEvidenceViewSet.get_queryset`) | A TL who omits `?user_id` gets **all** evidence of all users. The TL scope check runs only when `target_id` is set. | FIXED (`plugins.ticket_kpi.test_ticket_kpi`: `test_tl_list_without_user_id_is_scoped_to_own_and_team`) |
| SEC-03 | H | R | `config/views.py:22-79` (`protected_media`), `config/urls.py:149-160`, `settings_production.py:202` | Authenticated-only check, no per-object authorization, over all of MEDIA_ROOT. That includes `backups/` (full DB zips, guessable names `backup_%Y%m%d_%H%M%S.zip`, `plugins/site_backup/services/backup.py:~135`), `analytics_exports/`, `kpi_evidence/` and `onboarding/`. It is a plain Django view, so only session auth applies: JWT SPA users probably get 403 and Django-session users (admin login) get everything. | FIXED (`config/views.py` `_MEDIA_PREFIX_RULES` deny-by-default; `config/test_media.py`) |
| SEC-04 | M | R | `plugins/site_backup/services/restore.py:93-104` (`_extract_media`) | Zip-slip: no `commonpath` guard, and no uncompressed-size cap (zip bomb). Superuser-only, but a malicious backup file is the threat. | FIXED (`plugins.site_backup.tests.test_restore`: `test_zip_slip_member_is_rejected_and_nothing_is_written`; `MAX_MEDIA_UNCOMPRESSED_BYTES`) |
| SEC-05 | M | R | `apps/dashboard/viewsets.py:74-81` + `team_stats` (~:225), `top_pending_users` (~:493) and other widget actions | Any authenticated user can pass any `team_id` and read that team's counts and user names. `int(limit)` (~:503) throws a 500 on bad input. | FIXED (`apps.dashboard.tests.test_widget_team_scope`; tightened by launch review M-1) |
| SEC-06 | M | R | `apps/users/viewsets.py` `TeamViewSet.members` (~:1826-1854), `TechViewSet.list_users` (~:1546-1570), `list_for_reports` (~:1758) | Parent visible to all, child list unscoped. Any user gets the full `UserProfileSerializer` for any team's members, or the emails of a tech's users. This bypasses the `StaffFilterMixin` scoping used by `UserViewSet`. | FIXED (`apps.users.tests_app.test_child_list_scope`) |
| SEC-07 | M | R | `plugins/analytics/viewsets.py:754-766` (`ScheduledReportViewSet`) | No `get_queryset` scoping: any analytics viewer reads every user's schedules and recipients. | FIXED (`plugins.analytics.test_analytics`: `test_non_manager_sees_no_scheduled_reports`) |
| SEC-08 | M | R | `core/mixins/permissions.py:716-728,869-874` | Public-workspace visibility (see D2). | FIXED (`apps.overtime.test_workspace_visibility`: private workspace exposes nothing, public by design) |
| SEC-09 | M | R | `core/mixins/permissions.py:742-746,860-863` | For `approve`/`reject`, the filter mixins return the **unfiltered** queryset, so safety rests solely on `can_approve` (`apps/permissions/services/permission_service.py`). Bulk actions apply only the workspace filter. Needs proof-tests, not necessarily a change. | FIXED (proof tests `apps.overtime.test_approval_scope`) |
| SEC-10 | L-M | R | `apps/users/viewsets.py` `reset_password` (~:359-373), `create_user` (~:742) | Only `len>=6`, no `validate_password`. Existing refresh tokens are not blacklisted after a reset. | FIXED (`apps.users.tests_app.test_password_and_refresh`: `test_reset_password_rejects_weak_password_with_validator_messages`) |
| SEC-11 | L | R | `config/urls.py:69-72` | The health throttle keys on the last `X-Forwarded-For` value. Fine only if nginx overwrites XFF; verify. | FIXED (`NUM_PROXIES = 1` in `settings_production.py`; `ThrottleConfigurationTests.test_num_proxies_set_in_production`) |
| SEC-12 | L | R | `apps/users/viewsets.py:70-83` | `get_permissions` overrides every `@action(permission_classes=...)`. Any new admin action not on the list is open to any authenticated user. Add a guard test that walks the actions. | FIXED (`apps.users.tests_app.test_user_viewset_action_guard`) |
| SEC-13 | L | R | `apps/dashboard/models/core.py:~166` (`SiteBranding.logo`) | `FileField` with no extension or content validation. An SVG/HTML upload could be served inline. | FIXED (`SiteBrandingSerializer.validate_logo`; `apps.dashboard.tests.test_site_branding`: `test_svg_is_rejected`) |
| SEC-14 | L | R | `plugins/onboarding/viewsets.py:276-299`, `office_integration.py:138-147` | OnlyOffice callback JWT has no expiry or replay check beyond the key prefix. | DEFERRED (file token expires after 300 s; the document-server callback JWT is verified for signature only, no `exp`/replay check; see the triage table) |
| SEC-15 | L | R | `apps/reports/viewsets.py:~419` (`ExportExcelView`) | `UnifiedReportFilter` is used without `is_valid()`. | FIXED (`apps.reports.tests`: `test_bad_date_returns_400`) |
| SEC-16 | M | R | Writers listed below | CSV/XLSX formula injection: these writers bypass `core/utils/csv_safe.py`: `apps/reports/viewsets.py:497-575,1034-1050`, `apps/reports/services/export_service.py:302,338,430,450,477`, `plugins/audit_log/viewsets.py:130-145`, `plugins/analytics/reports.py:348-354,548`, `plugins/skills/services/export.py:74,184-197`, `plugins/ticket_kpi/viewsets.py:1805,1840-1850`, `plugins/data_import/viewsets.py:230,238`, `plugins/engagement/excel_export.py`. | FIXED (`apps/reports/test_csv_injection.py`, `plugins/*/test_csv_injection.py`, `plugins/engagement/test_excel_formula_safety.py`) |
| SEC-17 | M | R | `plugins/data_import/viewsets.py:395-401`, `plugins/tl_scorecard/epr_goal_import.py:189-196`, site_backup upload | Upload validation gaps: data_import has no extension or magic-byte check before pandas; the EPR PDF upload has no type check; the backup upload has no type check. | FIXED (`plugins/data_import/test_upload_validation.py`, `plugins/site_backup/tests/test_upload_validation.py`) |
| SEC-18 | L | I | `plugins/notifications/vapid_utils.py:21` | VAPID keys fall back to `.vapid_keys.json` in the working directory. Make sure prod reads them from env only. | FIXED (`VAPID_REQUIRE_ENV = True` in `settings_production.py`) |

#### Deployment (DEP)
| ID | Sev | St | Location | Finding | Status (2026-10-20) |
|---|---|---|---|---|---|
| DEP-01 | H | R | `.dockerignore`, `Dockerfile:50` (`COPY . /app`) | The image would include `db.sqlite3.bak-2026-10-11` (7.9 MB DB backup), `migration/out/*.csv` (users/leave/overtime, likely PII), `graphify-out/` (158 MB), `.opencode/` (61 MB), `admin-gui-screenshots/` (53 MB), `.codex`, `export_skills_plugin.py`. `DockerIgnoreContractTests` (`config/test_deployment.py:~441`) does not require them. | FIXED (`DockerIgnoreContractTests`; launch review D-1 added AdminGUI, pill-verify-shots, db.e2e.sqlite3) |
| DEP-02 | H | R | `docker-compose.yml:188-205` | Ingress service removed; docs stale (D1). | FIXED (`ComposeContractTests.test_no_ingress_service_is_claimed`; README and runbook describe an external proxy) |
| DEP-03 | H | R | `settings_production.py:130-168` | Prod logging has no console handler and no root logger, so app logs never reach `docker logs`. `logs/` has no volume. | FIXED (`ProductionSettingsHardeningTests.test_logging_has_console_handler_on_root_at_info`) |
| DEP-04 | H | R | `settings_production.py:84-99` | No `CONN_MAX_AGE` / `CONN_HEALTH_CHECKS`: a new Postgres+SSL connection on every request. | FIXED (`test_db_connections_are_persistent_and_health_checked`) |
| DEP-05 | M | R | `settings_production.py:205-213` | The prod Redis cache drops `IGNORE_EXCEPTIONS` and socket timeouts (dev block `settings.py:285-299` has them). A Redis blip means 500s, and throttles depend on the cache. | FIXED (`test_redis_cache_has_timeouts_and_ignores_outages`) |
| DEP-06 | M | R | `docker/entrypoint.sh:48,73` | `migrate` and the destructive `purge_hbpr_archive` run on every boot of every replica, with no lock. | FIXED (`EntrypointContractTests.test_boot_commands_are_gated_by_run_migrations_defaulting_to_on`) |
| DEP-07 | M | R | `docker-compose.yml:215-234` | `db-backup` is a one-shot, profile-only `pg_dump`: no schedule, retention, offsite copy or media backup. | FIXED (`ComposeContractTests.test_db_backup_is_a_scheduled_loop_with_retention_and_media`) |
| DEP-08 | M | R | — | No error monitoring or APM (D4). | DEFERRED (Sentry needs a new dependency and DSN, ruling D4 not given; runbook 5.6 documents the gap) |
| DEP-09 | M | R | `nginx.conf.template:110` | CSP `script-src 'unsafe-inline'` (D6). No `server_tokens off`, no general `/api/` rate limit. Security headers only on `/`. | FIXED (`NginxTemplateHardeningTests`); the enforcing CSP still carries `script-src 'unsafe-inline'` with a strict Report-Only twin (D6 measure-first default), so DEFERRED for that part |
| DEP-10 | L | R | `settings_production.py:10` | An empty `ALLOWED_HOSTS` does not fail fast. | FIXED (`test_empty_allowed_hosts_fails_fast`) |
| DEP-11 | L | R | `settings_production.py:71` | `ENABLE_API_DOCS=False` is hardcoded, and the env var set in the Dockerfile/CI is dead. | FIXED (`test_dead_api_docs_env_var_not_set_in_dockerfile_or_ci`) |
| DEP-12 | L | R | `requirements-production.txt:5` | `psycopg2-binary` in production. Low priority; keep pinned unless a build issue appears. | REJECTED (kept pinned; no build issue) |
| DEP-13 | L | R | `Dockerfile:89`, `docker-compose.yml:141` | 4 sync gunicorn workers with each loading pandas, on a CPU limit of 1.0. No `--worker-tmp-dir /dev/shm` or `--graceful-timeout`. | FIXED (`DockerfileGunicornContractTests`) |
| DEP-14 | L | R | `settings_production.py` | No `SESSION_COOKIE_AGE` (2-week default), no `DATA_UPLOAD_MAX_MEMORY_SIZE` review. nginx allows 512m bodies (`nginx.conf.template:31`). | FIXED (`test_session_lifetime_is_eight_hours`, `test_data_upload_limit_is_explicit`; nginx body limit documented, `test_global_body_limit_covers_backup_restore`) |

#### Performance (PERF)
| ID | Sev | St | Location | Finding | Status (2026-10-20) |
|---|---|---|---|---|---|
| PERF-01 | H | R | `apps/users/viewsets.py` `my_team_members` (~:918-985) | **Correctness bug.** Two `Sum()` over different reverse joins (`user__overtime_logs__hours`, `user__standby_logs__hours`) in one `.annotate()` fan out, so the monthly totals are inflated. Also an N+1 (no TL FK select, no `tech_assignments` prefetch). | FIXED (`apps.users.tests_app.test_perf_team_members`: `test_totals_are_exact_with_multiple_logs_of_both_kinds`) |
| PERF-02 | M | R | `UserProfileViewSet` (~:1096) + `UserProfileSerializer.get_albanian_tl_name`/`get_italian_tl_name` (`apps/users/serializers.py:551-560`) | 2 queries per row, page size up to 200. | FIXED (`test_directory_query_budgets`: `test_profile_list_with_search_and_paging_is_flat`) |
| PERF-03 | M | R | `italian_team_members` (~:1013), `TeamViewSet.members` (~:1846) | About 3 queries per row: `team_memberships__team`, `albanian_tl`, `user__user_groups__group` and `tech_assignments` are not prefetched. | FIXED (`test_directory_query_budgets`, launch review P-2) |
| PERF-04 | M | R | `plugins/payroll/serializers.py:424-440` | `PayrollRunSerializer.get_line_count` is a per-run `count()`, and `aggregate_line_totals` runs per run for team scope. | FIXED (`plugins.payroll.tests.test_run_list_query_budget`) |
| PERF-05 | L | R | `plugins/payroll/serializers.py:~372` | `get_working_day_count` uses `.filter()` on a prefetched relation, so the prefetch is bypassed. | FIXED (`get_working_day_count` counts over the prefetch, `plugins/payroll/serializers.py`) |
| PERF-06 | M | R | `plugins/notifications/viewsets.py:66` | `NotificationViewSet` has `pagination_class=None` and no retention: unbounded growth (D5). | FIXED (`plugins.notifications.test_pagination_prune`) |
| PERF-07 | M | R | `core/pagination.py:22-30` | `LargeResultsPagination.max_page_size=10000` on OT/standby/leave lists. | FIXED (`apps.overtime.test_pagination_clamp`) |
| PERF-08 | H | R | `plugins/notifications/signals.py:54-108`, `push_service.py:52-66` | Per-recipient fan-out runs inside model signals, including **synchronous `webpush()` HTTP calls with no timeout**. One slow push endpoint stalls an approval request. | FIXED (`plugins.notifications.test_push_resilience`: after commit, bounded timeout) |
| PERF-09 | M | R | `plugins/payroll/services/payroll_service.py:415-425,562-579` | Generate is a per-user `create`. Finalize is a per-entry `select_for_update().get` + two saves, which fires notification and audit signals per entry. | FIXED (`plugins.payroll.tests.test_generate_finalize_budget`) |
| PERF-10 | M | C | `core/middleware/user_context.py:40-42` | `UserContextMiddleware` evaluates `request.user.is_authenticated` (a session DB hit per request). **For JWT requests the user is anonymous at middleware time**, so `get_current_user()` used by `apps/reports/signals.py:56,140` is probably `None`: the **audit log likely loses the actor for every SPA write**. Confirm with a test first. | FIXED (`apps.reports.test_audit_actor`: `test_jwt_write_records_the_acting_user`) |
| PERF-11 | M | R | Model `Meta` | `LeaveRequest` is missing `(status, start_date)` and `(user, start_date)`. Redundant indexes: `OvertimeLog Index(['client'])`, `PayrollLine Index(['run','user'])`+`Index(['user'])`, `CalendarWorkspace Index(['team'])`, `UserSkill`/`MonthlyKPI` duplicating unique constraints. | FIXED (`apps.leave_management.test_indexes`) |
| PERF-12 | M | R | `plugins/site_backup/viewsets.py:80-88` | Backup creation (dumpdata + zip all media + sha256) runs inside the POST. Risk of a gunicorn 120s timeout. | DEFERRED (backup stays synchronous in the POST, gunicorn timeout 120 s; the queue is SR-01, POST-LAUNCH; runbook 5.6) |
| PERF-13 | L | R | `plugins/tl_scorecard/services.py:340-355` | Trend runs `build_scorecard` up to 24 times per request. Engagement runs `ensure_current_month_snapshots` on every request. | FIXED (`plugins.tl_scorecard.test_trend_budget`) |
| PERF-14 | L | R | `apps/users/viewsets.py:678-695`, importers (`plugins/data_import/importers/*.py`) | Per-row queries in loops. `bulk_delete` runs 3 `.count()` per user just to log. | FIXED for `bulk_delete` (`test_bulk_delete_budget`); importer per-row queries DEFERRED as launch review P-5 (POST-LAUNCH) |
| PERF-15 | L | R | `core/utils/cache.py:57-87` | Every OT/leave write wipes `dashboard_all`. An O(n) scan on LocMem; fine on Redis `delete_pattern`. | FIXED (`delete_pattern_safe` in `core/utils/cache.py` uses native `delete_pattern` on Redis) |

#### Workflow docs (DOC)
| ID | Location | Finding | Status (2026-10-20) |
|---|---|---|---|
| DOC-01 | `CLAUDE.md:100`, `docs/workflow-invariants.md:52` | They say "use `count_business_days`" for leave. Vacation counting now goes through `count_leave_days`/`count_request_days` (`apps/leave_management/models/core.py:~58,74`), which exclude global holidays (commit `faf475c`). Leave carry-over (`services/carry_over.py`, `apply_leave_carry_over`, `days_counted`) is documented nowhere except its plan. | FIXED (launch review D-7, D-6) |
| DOC-02 | `CLAUDE.md` Task Router | No rows for notifications/kill-switch, onboarding/OnlyOffice, audit_log or leave carry-over. The "carryover" keyword routes to `06-DOMAIN-INVARIANTS.md`, which covers only OT/payroll carry-over. | FIXED (launch review D-7: router rows for leave, timezone, notifications, audit log, onboarding, confidentiality, deploy) |
| DOC-03 | `.devin/context/PLUGINS/` | No context file for `analytics`, `audit_log`, `notifications`, `onboarding`. `00-INDEX.md` omits `09-engagement.md`. | DEFERRED (`.devin/` is gitignored; tracked essentials moved to `docs/workflow-invariants.md`; local plugin context files are optional) |
| DOC-04 | `CLAUDE.md` Hot Invariants | Duplicates: payroll at :86-87; admin lift at :93-95, including a stale "plain right-aligned column", since superseded by `RowActionsPill` (commit `8e9a674`). Contradiction: "payroll view HR-only" (:134) vs "full parity with staff" (:98). Point-in-time "Gate state at handoff" (:118). Garbled tab/newline at :131-132. Unbolded bullets at :134-135. | FIXED (launch review D-7: payroll and admin-lift bullets merged, gate-state sentence and garbled text removed) |
| DOC-05 | `CLAUDE.md:89,125,126` | Stale line refs: `core/mixins/permissions.py:536,756` (now ~594,814), `Sidebar.tsx:130` (~131), `AdminSidebar.tsx:165-166` (~188-189). Bare `lib/queryOptions.ts`. Audit commands at :48,53,109 lack `cd frontend`. | FIXED (launch review D-7: symbols instead of line numbers, `cd frontend &&` prefixes) |
| DOC-06 | `.devin/context/12-VISUAL-VERIFICATION.md:55-57`, `frontend/playwright.config.ts:22-27`, `frontend/e2e/global-setup.ts:16-17` | The docs claim Playwright needs no setup. In reality `webServer` runs plain `python ..\manage.py runserver` (default `config.settings`), and global-setup migrates and seeds **the dev `db.sqlite3`** unless `DJANGO_SETTINGS_MODULE=config.settings_e2e` is exported. The correct recipe is in `docs/superpowers/UPGRADE-JOURNAL.md:1034-1048`. | FIXED in the tracked config and `docs/workflow-invariants.md` E2E section; the local `.devin/context/12-VISUAL-VERIFICATION.md` text is unchanged (gitignored) |
| DOC-07 | `frontend/e2e/helpers.ts:13-25`, `frontend/scripts/visual-route-manifest.mjs:35-44`, `_gen-storage-state.mjs:20` | `E2E_CREDENTIALS` lacks `e2e_super` and `e2e_cr`. The manifest says `cr_admin: null // NO FIXTURE`, but the seed creates `e2e_cr` (`seed_e2e_data.py:~81`). The storage-state script uses non-e2e user `admin`. | FIXED (`helpers.ts` has `e2e_super`/`e2e_cr`; `visual-route-manifest.test.mjs` "cr_admin is backed by the seeded e2e_cr identity (DOC-07)") |
| DOC-08 | `README.md:29-57` | Links to the missing `.devin/workflows/agent-dispatch.md` and `.devin/tracking/CHANGES_OPTIMIZED.md`. Audit date 2026-05-30. 10 of 13 plugins unmentioned. Tunnel instructions stale (DEP-02). | FIXED (launch review D-4) |
| DOC-09 | `.claude/hooks/context-router.ps1:3-13` | Prints 11 routes. Missing: visual verification, skills, organigrama, data import, backup, HBPR, engagement, calendar, tables. | FIXED (launch review D-9, local hook `.claude/hooks/context-router.ps1`, not tracked) |
| DOC-10 | `AGENTS.md` | No 2026-10-13 entries (leave carry-over, detail drawers). | FIXED (launch review D-8) |
| DOC-11 | `frontend/scripts/shot-audit.mjs`, `shot-flows.mjs` | Marked "TEMPORARY… DELETE after". | OPEN (`frontend/scripts/shot-audit.mjs` and `shot-flows.mjs` still say "TEMPORARY, DELETE"; nothing imports them; deleting tracked files needs the owner, POST-LAUNCH) |
| DOC-12 | `CLAUDE.md:163` vs `.devin/rules/CONTEXT.md:304-306` | Production is Python 3.12 vs "the stack is Python 3.14". `skills-lock.json` lists `fallow`, but `.claude/skills/fallow` is absent. | FIXED for the Python version statement (D-7); `skills-lock.json` lists `fallow` while `.claude/skills/fallow` (gitignored) is absent: OPEN, local only |

#### CI gaps (CI)
| ID | Finding | Status (2026-10-20) |
|---|---|---|
| CI-01 | No Playwright job (the e2e suite exists, never runs in CI). | FIXED (`e2e` job in `ci.yml`) |
| CI-02 | Backend tests run on SQLite only; prod is Postgres. | FIXED (`backend-postgres` job, `config/settings_ci_pg.py`) |
| CI-03 | `modal-audit.mjs` (the "Done =" gate in CLAUDE.md), `modal-visual-audit.mjs`, `dashboard-audit.mjs` and the `node --test` files for visual-fingerprint, visual-route-manifest, visual-capture-helpers and admin-routes are not in CI. | FIXED (modal/dashboard audits and the four `node --test` files incl. `visual-route-manifest.test.mjs` since launch review D-2) |
| CI-04 | No image scan (trivy), secret scan (gitleaks), `docker compose config`/`nginx -t` validation, or scheduled weekly `pip-audit`/`npm audit` (open item P3-6 of `.devin/plans/plan-production-security-2026-08-21.md`). | FIXED (`image-scan`, `gitleaks`, `deploy-config`, `security-weekly.yml`) |
| CI-05 | Docker job builds but never smoke-runs the images. | FIXED (`smoke` job) |

### Status (2026-10-20): launch review reconciliation

Added by the launch review (Task 6): each §0.1 row carries a Status column checked against HEAD (test name or file as evidence). Checkboxes are ticked only where that evidence exists; unticked steps are either not verifiable from code (browser gates 1.5, 3.4, 10.x, 11.x, rehearsal), local-only (`.devin/`, `.claude/`), or open: 2.14 (SEC-14), 4.7 (DEP-08), 5.10 (PERF-12), 5.11 (PERF-14 importer part), 5.12, 9.1 (Hot Invariants for throttles, `protected_media`, audit actor were not added), 9.3, 9.4, 9.8, 9.10, 9.11. Triage of everything deferred: `docs/reviews/2026-10-20-launch-review.md` §Deferred items triage.

### 0.2 Allowed APIs (verify each with `context7` before first use; do not invent)

| API | Use | Source to confirm |
|---|---|---|---|
| `DATABASES[...]['CONN_MAX_AGE']`, `['CONN_HEALTH_CHECKS']` | DEP-04 | Django 6.1 docs: settings → DATABASES |
| `django.contrib.auth.password_validation.validate_password(password, user=None)` | SEC-10 | Django docs: password validation |
| `rest_framework_simplejwt.token_blacklist.models.OutstandingToken` / `BlacklistedToken` | SEC-10 revoke | simplejwt 5.5 docs (blacklist app). Confirm the app is in `INSTALLED_APPS`. |
| `rest_framework.throttling.ScopedRateThrottle` (`rate=None` means unlimited) | SEC-01 | DRF 3.18 docs: throttling |
| `os.path.commonpath` / `pathlib.Path.resolve().is_relative_to()` | SEC-04 | Python stdlib. Copy the guard at `config/views.py:51-60`. |
| `django.db.models.Subquery`, `OuterRef`, `Sum`, `functions.Coalesce` | PERF-01 fan-out fix | Django docs: query expressions |
| `django.db.models.Prefetch(lookup, queryset=..., to_attr=...)` | PERF-02/03 | Copy `apps/leave_management/viewsets.py:441-453` + `serializers.py:127-143` |
| `django.db.transaction.on_commit` | PERF-08 | Copy `plugins/ticket_kpi/signals.py:15-32` |
| `pywebpush.webpush(..., timeout=...)` | PERF-08 | **Verify the parameter exists in the pinned pywebpush version** (`pip show pywebpush`, then context7 or source). If absent, use `requests` session timeout via `WebPusher(...).send(timeout=...)`, only if that exists. Never guess. |
| `django_redis` `OPTIONS`: `SOCKET_CONNECT_TIMEOUT`, `SOCKET_TIMEOUT`, `IGNORE_EXCEPTIONS` | DEP-05 | Copy `config/settings.py:285-299` |
| `core/utils/csv_safe.py` (server), `frontend/src/lib/csvSafe.ts` (client) | SEC-16 | Read both before use. Equivalent: `plugins/tl_scorecard/csv_export.py:22-51`. |
| `CacheKey.dashboard_reference` + `get/set_cached_response_data` | optional caching | `apps/dashboard/viewsets.py:942-992` |
| `assertNumQueries` / `CaptureQueriesContext` | every PERF fix | Copy `plugins/control_room/test_query_counts.py:66-84`, `apps/overtime/test_bulk_query_budget.py:41-68` |

**Copy-ready good patterns:**
- report scoping: `apps/reports/filters.py:18` `apply_visibility_constraints`
- team-scoped lookup: `plugins/ticket_kpi/viewsets.py:~802`
- cross-user check: `plugins/ticket_kpi/viewsets.py:~1543` `_check_cross_user_access`
- queryset scope: `plugins/payroll/viewsets.py:83` `_allowed_payroll_user_ids`, `core/mixins/viewer_scope.py:65`
- upload validation: `plugins/ticket_kpi/upload_validation.py:143` `validate_upload`
- safe file serving: `plugins/onboarding/viewsets.py:~387` (`FileResponse(as_attachment=True, filename=...)`)
- SSRF guard: `plugins/onboarding/office_integration.py:45-81`
- annotated counts: `apps/users/viewsets.py:~1738` + `TeamSerializer.get_*_count`
- Redis options: `config/settings.py:285-299`
- secret fail-fast: `settings_production.py:172-183`
- dockerignore contract test: `config/test_deployment.py:~441`

### 0.3 Anti-patterns (forbidden in every phase)
- Inventing a DRF/Django/simplejwt/pywebpush parameter. Verify first (§0.2).
- Fixing a parent-scoped `@action` by checking only the parent object. Scope the **child** rows (CLAUDE.md "parent-object scope ≠ child-object scope").
- `except Exception:` around an optional-plugin import returning a permissive default. Use `except ImportError:` only.
- Gating a URL with `startswith()`. Use parsed scheme+host+port.
- Adding `natural_foreign`/`natural_primary` to backup `dumpdata`.
- Regenerating `apps/users` migration `0015` (`UserTech`), or ORM-filtering removed `profile__is_team_leader`/`profile__team` columns.
- `count_business_days` for vacation (use `count_leave_days`/`count_request_days`).
- Adding a package without the user's permission (D3, D4).
- Weakening a test to make it pass. Fix the code; if the spec is wrong, update this plan first.
- Running Playwright or seed commands without `DJANGO_SETTINGS_MODULE=config.settings_e2e` (it seeds the dev DB, DOC-06).
- Touching `.vapid_keys.json`, `.env`, `db.sqlite3` contents, or pasting seed passwords into chat or docs.

---

## Global rules for every phase

- **Branching:** one branch per phase from fresh `origin/main` (`superpowers:using-git-worktrees`), named `chore/prod-<phase-slug>`. In an app-made worktree, use `sync_with_base_branch`, never `git merge`/`git pull`.
- **DB:** after pulling or switching branches, run `py -3.14 manage.py migrate`. Then `py -3.14 manage.py showmigrations | grep "\[ \]"` must print nothing.
- **TDD** (`test-driven-development` / `django-tdd`): failing test → confirm it fails for the right reason → minimal fix → pass. Record the red and green outputs in the evidence block.
- **Targeted tests while iterating; the full suite once per phase at the end** (commands in §Verification commands).
- **Single writer:** only one agent edits source at a time. Parallel subagents are read-only (audits, discovery).
- **Self-correction table:** `.devin/context/11-PLAN-CREATION.md` §7, if present locally. Otherwise:

| Failure | Action |
|---|---|---|
| Must-stay-green test fails | Implementation deviated. Fix the code, never the test. |
| New test fails after fix | Diff spec vs code. If the spec is wrong, update this plan first. |
| Finding turns out false | Mark it `REJECTED` in the register with a one-line reason and the evidence. Do not fix a non-bug. |
| Fix needs a product decision | Stop and ask (AskUserQuestion). Do not guess. |
| 3 failed attempts on one gate | STOP. Report the failing output, plan section and attempts. |

- **Evidence block:** each phase ends with a fenced block listing commands run and pass/fail counts, the red→green test names, browser screenshots (paths) and console/network results. No evidence means not done (`superpowers:verification-before-completion`).
- **Review:** before finishing a phase, run the `review` skill (or `code-review`) on the phase diff. Triage findings: implement the confirmed ones, reject the rest with a written reason.
- **After code changes:** `graphify update .` (AST only, no API cost) and `mcp__trace__register_edit` for edited files.

---

## Browser verification protocol (used by Phases 1, 2, 5, 9, 10, 11)

**Tools, in order of preference:**
1. **CloakBrowser MCP** (`mcp__cloakbrowser__*`, load via `ToolSearch` query `cloakbrowser`). This is the project's sanctioned visual-verify browser (CLAUDE.md "Button look").
2. **Built-in browser pane** (`mcp__Claude_Browser__*`). Load the `anthropic-skills:built-in-browser` skill first, then `preview_start {name:"backend"}` and `{name:"frontend"}` from `.claude/launch.json`.

**Servers:**
- Dev DB: `preview_start` the `backend` + `frontend` configs.
- e2e DB (preferred for role checks; never touches `db.sqlite3`): add the Phase 1 launch config `backend-e2e`, which passes `--settings=config.settings_e2e`. Before starting it, run `py -3.14 manage.py prepare_e2e_db --settings=config.settings_e2e`.
- On Windows, check for orphaned servers first: `netstat -ano | findstr :8000` and `:5173`.

**Role logins:**
- Users come from `apps/users/management/commands/seed_e2e_data.py`: `e2e_employee_a`, `e2e_employee_b`, `e2e_employee_c`, `e2e_tl`, `e2e_tl_b`, `e2e_hr`, `e2e_tl_hr`, `e2e_admin`, `e2e_super`, `e2e_cr`, `e2e_hbpr`.
- The password is in that file. **Never paste it into chat, docs or commits.** These are local test credentials on `127.0.0.1` only.

**Page Gate** (required for every page a phase touches, and for the role sweep in Phase 11):
1. Navigate via SPA links (not hard reloads in a loop, because of the auth throttle and token rotation; see `.devin/context/12-VISUAL-VERIFICATION.md` pitfalls).
2. `browser_console_messages` / `read_console_messages` (onlyErrors) returns **0 errors**.
3. `browser_network_requests` / `read_network_requests`: every `/api/` call returns 2xx, or the expected 403/404 for negative checks. Record any 5xx.
4. Light **and** dark theme screenshots, plus one at 375px width (`browser_resize` / `resize_window preset:"mobile"`; reset to desktop after).
5. Click through every tab and action that the phase touched (open dialogs, submit with test data on localhost only).
6. Save screenshots under `design-fingerprints/prod-readiness/<phase>/<role>-<page>-<theme>.png`. Check for identical file hashes, which signal a failed navigation (`11-PLAN-CREATION.md` §2 trap table).

**Security spot-checks in the browser** (complement backend tests, never replace them):
- Log in as the restricted role.
- Open the page that lists the fixed resource.
- Read the actual API response body with `read_network_requests` (requestId) or `browser_network_request`.
- Confirm only in-scope rows appear.

Example for SEC-02: as `e2e_tl`, open Ticket KPI → Evidence, then inspect `GET /api/plugins/ticket_kpi/evidence/`. Every row's `user` must be in that TL's team.

---

## Phase 1: Baseline, safety net, and a trustworthy e2e/browser harness

**Why first:** every later phase depends on a known-green baseline and a browser harness that cannot corrupt the dev DB (DOC-06, DOC-07).

**Skills:** `superpowers:using-git-worktrees`, `e2e-testing-patterns`, `superpowers:verification-before-completion`.

**Required reading:** `docs/superpowers/UPGRADE-JOURNAL.md:1027-1052`, `.devin/context/12-VISUAL-VERIFICATION.md`, `frontend/playwright.config.ts`, `frontend/e2e/global-setup.ts`, `frontend/e2e/helpers.ts`, `apps/plugins/management/commands/prepare_e2e_db.py`, `config/settings_e2e.py`, memory note `reference_e2e_runbook.md`.

**Tasks:**
- [ ] 1.1 Baseline. Run the full backend + frontend pass (§Verification commands) on clean `main`. Record pass/fail counts and **pre-existing failures** in the evidence block. Later phases compare against this list.
- [x] 1.2 Make Playwright DB-safe (DOC-06). In `frontend/playwright.config.ts` `webServer[0].command`, pass `--settings=config.settings_e2e` to `runserver`. Also make `global-setup.ts` set `DJANGO_SETTINGS_MODULE=config.settings_e2e` for its child processes, or pass `--settings`.
  - Test: run `npx playwright test e2e/auth.spec.ts --project=chromium` and confirm `db.sqlite3` mtime is unchanged, and `db.e2e.sqlite3` mtime changed.
- [ ] 1.3 Add launch config `backend-e2e` to `.claude/launch.json` (local-only file): `py -3.14 manage.py runserver 127.0.0.1:8000 --noreload --settings=config.settings_e2e`, port 8000.
- [x] 1.4 Fix the fixtures (DOC-07):
  - Add `e2e_super` and `e2e_cr` to `E2E_CREDENTIALS` in `helpers.ts`. Reference the same password constant; do not duplicate the literal if one exists.
  - Set `cr_admin` in `visual-route-manifest.mjs` `ROLE_FIXTURES` to `e2e_cr`, and update its `node --test` expectations.
  - Make `_gen-storage-state.mjs` use an e2e user.
  - Make the visual scripts honour an exported `DJANGO_SETTINGS_MODULE` instead of `setdefault('config.settings')` overriding nothing. Verify `os.environ.setdefault` semantics: it already respects an exported var, so this may only need doc text.
- [ ] 1.5 Browser baseline. Run the Page Gate on the dashboard home for each of the 11 seeded roles (light theme only is enough here). This is the "before" picture for Phase 11.

**Verification:** baseline evidence recorded; Playwright auth spec green; dev DB untouched (mtime proof); 11 role screenshots captured.
**Anti-pattern guards:** never run `seed_e2e_data` without the e2e settings; do not "fix" pre-existing failures here, only record them.

---

## Phase 2: Authorization and auth fixes (SEC-01…SEC-15, minus SEC-16/17)

**Skills, in order:** `django-access-review` (for each viewset before editing), `security-review`, `django-security`, `test-driven-development` / `django-tdd`, then `review` on the diff. Run `security-reviewer` as a read-only agent on the final diff.

**Required reading:** `.devin/context/01-PERMISSIONS.md`, `.devin/context/09-RESOURCE-ACCESS.md`, `.devin/context/10-PLUGIN-PERMISSIONS.md`, `.devin/context/PLUGINS/03-ticket-kpi.md`, `PLUGINS/07-backup-restore.md`, `docs/workflow-invariants.md`, plus each target file around the cited symbol.

**Gate D2** must be answered before SEC-08.

**Tasks** (each: red test → fix → green; test file next to the existing tests of that app):
- [x] 2.1 **SEC-01 throttles.**
  - Test (in `config/test_deployment.py`): import `config.settings_production` with `DEBUG` env **unset** and with `DEBUG=1`, then assert every value in `REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']` is non-`None`.
  - Fix: in `settings_production.py`, rebuild `DEFAULT_THROTTLE_RATES` explicitly (copy the six scoped rates from `settings.py:215-220` as literals), keeping `NUM_PROXIES`.
  - Confirm `settings_e2e.py` still nulls them (it builds from the base dict; unaffected).
- [x] 2.2 **SEC-02 evidence list.**
  - Test: as a TL with no `user_id`, the evidence list returns only own + team rows. As HR/admin it returns all.
  - Fix: in the TL branch with no `target_id`, filter `qs.filter(Q(user=user) | Q(user__in=_get_tl_team_members(user)))`. Read `_get_tl_team_members` first; it must return users or ids, so match its type.
- [x] 2.3 **SEC-03 media.**
  - First inventory how the frontend fetches media. Search `frontend/src` for `/media/`, `file_url`, `download_url`, `.file` usage.
  - Write tests in `config/test_media.py`:
    1. non-superuser session → `backups/x.zip` is 403/404
    2. a user cannot fetch another user's `kpi_evidence/` file
    3. `analytics_exports/` only for the job owner
  - Fix: make `protected_media` **deny by default**. Allow only through a prefix → authorizer map (`backups/`: superuser; `kpi_evidence/` and `onboarding/`: resolve the owning model row by `file` name and reuse that viewset's scope; `analytics_exports/`: job owner). Unknown prefixes go to staff only.
  - If the inventory shows the SPA already downloads everything through DRF endpoints, the simpler fix is allowed: restrict `protected_media` to staff/superuser. Record which branch was chosen.
- [x] 2.4 **SEC-04 zip-slip and bomb.**
  - Test: a crafted zip with `media/../../evil.txt` raises, and nothing is written outside MEDIA_ROOT (use `tempfile` + `override_settings(MEDIA_ROOT=...)`).
  - Test: total uncompressed size over the cap is rejected.
  - Fix: resolve the target, reject when it is not inside MEDIA_ROOT (pattern `config/views.py:51-60`), and sum `ZipInfo.file_size` before extracting.
- [x] 2.5 **SEC-05 dashboard `team_id`.**
  - Test: an employee or a TL passing a foreign `team_id` gets 403, or an empty scoped result. Pick the one matching the existing response contract of these actions, so the frontend does not break.
  - Test: `limit=abc` returns 400, not 500.
  - Fix: validate `team_id` against `get_team_member_ids()`/led teams for TLs, or all for staff/HR.
- [x] 2.6 **SEC-06** `TeamViewSet.members`, `TechViewSet.list_users`, `list_for_reports`.
  - Tests per action: an employee gets only fields and rows allowed by `UserViewSet` scoping.
  - Fix: apply the same `StaffFilterMixin` scope to the child queryset.
  - Before changing, check which frontend pages call these endpoints (`find_usages` / search `frontend/src/services`) and keep those roles working. Browser-verify those pages.
- [x] 2.7 **SEC-07** `ScheduledReportViewSet.get_queryset`: owner only, staff all. Test both.
- [x] 2.8 **SEC-08** per the D2 answer.
- [x] 2.9 **SEC-09** proof tests only:
  - a TL cannot approve or reject another team's OT/standby/leave through the single and bulk endpoints
  - a TL cannot approve their own
  - Change code only if a test fails.
- [x] 2.10 **SEC-10.** `reset_password` and `create_user` call `validate_password(pw, user)` and return 400 with the validator messages. A reset also blacklists the user's outstanding refresh tokens (verify the simplejwt blacklist API in §0.2). Tests for both.
- [x] 2.11 **SEC-11.** Read nginx `/api/` proxy headers. If `X-Forwarded-For` is set from `$remote_addr` (overwritten, not appended), document it and close. Otherwise align it with DRF `NUM_PROXIES`. Test the health throttle key.
- [x] 2.12 **SEC-12.** Guard test: walk every `@action` on `UserViewSet`. Each must be either in the `IsAdminUser` list in `get_permissions` or in an explicit allow-list in the test, with a reason.
- [x] 2.13 **SEC-13.** Add extension and content validation for `SiteBranding.logo` (png/jpg/webp; reject svg/html), reusing the `validate_upload` style. Migration only if a validator is added to the field. Then run `makemigrations --check`.
- [ ] 2.14 **SEC-14.** Add an `iat`/`exp` check (for example 1 day) to the OnlyOffice callback JWT verification, if OnlyOffice sends `iat`. Verify against OnlyOffice docs via context7. If unverifiable, record it as SR follow-up instead.
- [x] 2.15 **SEC-15.** Call `is_valid()` (or the same validation the sibling views use) in `ExportExcelView`. Test that a bad date returns 400.
- [x] 2.16 **SEC-18.** Confirm the prod VAPID source. If the file fallback can trigger in the container, make prod require env vars (fail-fast like SECRET_KEY).

**Browser verification:**
- Page Gate on Ticket KPI Evidence (as `e2e_tl`, `e2e_hr`), Admin dashboard widgets (as `e2e_tl`, `e2e_admin`), Teams page and member drawer (as `e2e_admin`, `e2e_hr`), Analytics scheduled reports (as an analytics viewer), and any media download link (as `e2e_employee_a`, `e2e_admin`).
- Include the security spot-checks of response bodies.

**Verification:** targeted tests green; `py -3.14 manage.py test apps plugins config` green vs the Phase 1 baseline; `ruff` clean on changed files.

**Phase 2 execution notes (2026-10-14, spec corrections and decisions):**
- 2.3 SEC-03: inventory showed the SPA only fetches media through DRF endpoints (the single `/media/` consumer is the `branding/` logo `<img>`; `KPIEvidence.file_url` is unused in `frontend/src`). Branch chosen: deny by default. `branding/` any authenticated user, `backups/` superuser, everything else staff/superuser. Per-object owner authorizers were not built.
- 2.6 SEC-06: `list_for_reports` returns only id/name/code/member count, the same facts the unrestricted team list already exposes, so it is REJECTED as a leak (pinned by a test). `members` is scoped to the viewer; `TechViewSet.list_users` is staff/HR only (its only caller is the admin Techs page).
- 2.7 SEC-07: `ScheduledReport` has no owner column, so "owner sees own" is not expressible without a schema change. Visibility follows the `analytics.manage` grant instead (the SPA renders the panel only for those users).
- 2.9 SEC-09: proof tests FOUND a real hole: a team leader could approve/reject their own OT/standby/leave (single and bulk) because `get_team_member_ids()` includes the TL. Fixed in `permission_service.can_approve`. Foreign-team approve/reject was already refused.
- 2.14 SEC-14: the OnlyOffice docs sample callback token carries only `payload` (no `iat`/`exp`), so an expiry check cannot be confirmed. Recorded as follow-up SR, no code change.
- 2.16 SEC-18: production sets `VAPID_REQUIRE_ENV`; `get_vapid_keys()` raises `ImproperlyConfigured` at use time (the public-key endpoint answers 503) instead of importing-time failure, because compose passes empty defaults and the Dockerfile/CI `check --deploy` run production settings without push keys. Separate pre-existing bug seen: `generate_vapid_keys()` cannot JSON-serialize the key objects, so the dev file fallback never persists.

---

## Phase 3: Export, CSV and upload hardening (SEC-16, SEC-17)

**Skills:** `security-review`, `test-driven-development`.
**Required reading:** `core/utils/csv_safe.py`, `plugins/tl_scorecard/csv_export.py:22-51`, `plugins/payroll/services/export_service.py:~27`, `plugins/ticket_kpi/upload_validation.py`, `.devin/context/PLUGINS/06-data-import.md`.

- [x] 3.1 One shared test helper asserts that a cell starting with `= + - @ \t \r` is prefixed with `'` in the produced CSV/XLSX.
  - Add one test per writer listed in SEC-16, feeding a user-controlled text field such as reason/notes/name = `=HYPERLINK(...)`.
- [x] 3.2 Route each writer through `csv_safe`. For XLSX via openpyxl/xlsxwriter, apply the same neutralizer to string cells. Do **not** write a new sanitizer; extend `csv_safe` only if XLSX needs a helper, and test it.
- [x] 3.3 SEC-17:
  - data_import: check extension + magic bytes before pandas, reusing `validate_upload`'s policy-dict pattern with a new `data_import` policy.
  - EPR goal PDF: `%PDF-` magic + extension.
  - site_backup upload: `.zip` + `PK\x03\x04` magic.
  - Tests for each reject path. Size checks must still run **before** parsing (CLAUDE.md data import invariant).
- [ ] 3.4 Browser: download one export per touched writer as `e2e_admin` (reports, audit log, skills, ticket KPI, engagement). Confirm a 200, a correct filename, and that the file opens (`anthropic-skills:xlsx` skill to read an XLSX if needed). Run one data-import upload of the sample template through the UI.

---

## Phase 4: Deployment hardening (DEP-01…DEP-14, CSP)

**Skills:** `django-security` (deployment section), `security-review`, `context7:docs` for django-redis/gunicorn/nginx.
**Required reading:** `Dockerfile`, `docker-compose.yml`, `docker/entrypoint.sh`, `frontend/docker/nginx.conf.template` (read CLAUDE.md "Production admin routing" first: envsubst and `$lowercase` nginx vars), `config/settings_production.py`, `config/test_deployment.py`, `.devin/plans/plan-production-security-2026-08-21.md` (open items P2-5, P3-1…P3-7).
**Gates:** D1, D4, D6.

- [x] 4.1 **DEP-01.**
  - Extend `DockerIgnoreContractTests` to require: `*.bak*`, `*.csv` (or `migration/`), `graphify-out/`, `.opencode/`, `.codex/`, `admin-gui-screenshots/`, `design-screenshots/`, `design-fingerprints/`, `*.patch`, `*.log`, `time_tracker_export.json`, `*.xlsx`, `export_skills_plugin.py`. Red → add the patterns → green.
  - Then `docker build -t et-backend .` and `docker run --rm et-backend sh -c "ls /app; ls /app/migration 2>/dev/null"` show none of them.
- [x] 4.2 **DEP-03 logging.**
  - Test: under production settings, `LOGGING` has a console `StreamHandler` on the root logger at INFO and on `django.request` at WARNING.
  - Fix: add a console handler (keep the security file handler, or route security to the console too).
  - Optional: JSON formatter via stdlib `logging.Formatter` only (no new dependency).
- [x] 4.3 **DEP-04.** Set `CONN_MAX_AGE = int(os.getenv('DB_CONN_MAX_AGE', '60'))` and `CONN_HEALTH_CHECKS = True` in prod `DATABASES`. Test the values. Note in the docs that with sync gunicorn each worker holds 1 connection (4 workers per replica vs the Postgres `max_connections` default of 100).
- [x] 4.4 **DEP-05.** Copy the dev Redis `OPTIONS` (timeouts, `IGNORE_EXCEPTIONS`) into the prod `CACHES`. Test. Note the trade-off: with `IGNORE_EXCEPTIONS`, the throttle silently fails open on a Redis outage. Accept it and document it, since availability beats throttling, and nginx still rate-limits admin login.
- [x] 4.5 **DEP-06.** In `entrypoint.sh`, run `migrate` and the boot commands only when `RUN_MIGRATIONS=1` (default `1`, keeping single-replica behaviour). Document that multi-replica deploys set it on exactly one job or container.
  - Keep the order `sync_plugins` → `seed_plugin_permissions` → `grant_hbpr_plugin_access` (pinned by `apps/plugins/test_hbpr_boot_path.py`; update that test if the gate changes its expectations).
  - `purge_hbpr_archive` stays in the gated block.
- [x] 4.6 **DEP-07 backups.** Add a documented schedule to the existing `db-backup` service (a loop with `sleep`, plus a retention of N files, with N as an env var). Add a media backup (tar of the `media_files` volume) and a restore runbook in `docs/deploy/` (new tracked doc). No new images beyond the existing postgres one.
- [ ] 4.7 **DEP-08 (D4).** If approved:
  - Add `sentry-sdk` pinned in `requirements-production.txt`.
  - Init in `settings_production.py` only when `SENTRY_DSN` is set, with `send_default_pii=False`.
  - Test the no-DSN path. Then run `pip-audit`.
- [x] 4.8 **DEP-09 nginx.**
  - Add `server_tokens off`.
  - Add `limit_req_zone` for `/api/`, sized generously (for example 20r/s burst 40, per real client IP via the existing trusted-IP logic).
  - Add security headers to every location that serves content (`add_header` inheritance: a location with its own `add_header` drops the parent's).
  - D6: add a `Content-Security-Policy-Report-Only` header with a strict `script-src 'self'`.
  - Validate with `docker run --rm -v ...:/etc/nginx/templates nginx:1.27-alpine-slim nginx -t` after envsubst, or the frontend image build.
- [x] 4.9 **DEP-10, DEP-11, DEP-14.**
  - Fail fast on an empty `ALLOWED_HOSTS` (copy the SECRET_KEY guard pattern).
  - Either read `ENABLE_API_DOCS` from env (default False) or delete the dead env var from the Dockerfile/CI. Recommend deleting it (smaller surface).
  - Set `SESSION_COOKIE_AGE` (for example 8h) and an explicit `DATA_UPLOAD_MAX_MEMORY_SIZE`. Align nginx `client_max_body_size` with the largest real upload (site_backup 500MB is declared there; keep it scoped to that location, not global).
  - Tests for each.
- [x] 4.10 **DEP-13.** Add `--worker-tmp-dir /dev/shm --graceful-timeout 30` to gunicorn. Make `--workers` env-driven (`GUNICORN_WORKERS`, default 3) and document the CPU-limit relationship.
- [x] 4.11 **DEP-02 (D1).** Implement the chosen ingress option; at minimum, fix README and `.env.example` text. If documenting an external proxy: list required headers (`X-Forwarded-Proto`, `CF-Connecting-IP` or `X-Real-IP`) and the trusted subnet in nginx.
- [x] 4.12 Run `py -3.14 manage.py check --deploy --settings=config.settings_production` with the CI env block (`.github/workflows/ci.yml:134-146`) and get 0 warnings. `docker compose config -q` must exit 0.

**Browser verification:** none in this phase (no UI change). Rehearsal happens in Phase 10.

**Phase 4 fix record.**
- drf_spectacular: the six `check --deploy` warnings are fixed with type hints, `extend_schema_field` (`TechAssignmentField`) and `extend_schema` (`TokenLogoutView`, `GatedSpectacularAPIView` reusing `drf_spectacular.views.SCHEMA_KWARGS`). Pinned by `OpenAPISmokeTests.test_schema_generation_has_no_phase4_warnings`; `check --deploy` now reports 0 issues.
- nginx: global `client_max_body_size` restored to `512m`; the redundant `/api/plugins/site_backup/` location was removed (it only repeated `/api/`). `NginxTemplateHardeningTests` now pins this.
- ticket_kpi: `_resolve_evidence_max_mb` no longer reads a non-existent `profile.max_file_size_mb`; the limit is the plugin config value (default 10).

---

## Phase 5: Backend performance (PERF-01…PERF-15)

**Skills:** `django-perf-review` (run it on each target module **before** editing and record its findings), `django-patterns`, `test-driven-development`.
**Required reading:** `.devin/context/02-DATA-MODELS.md`, `.devin/context/04-API-PATTERNS.md`, `.devin/plans/plan-security-perf-cache-audit-2026-09-27.md` (open items: live-DB profiling, test-cache isolation), `.devin/context/PLUGINS/01-payroll.md`, `PLUGINS/09-engagement.md`, `docs/engagement-metrics.md`.
**Gates:** D3, D5.

**Order:** correctness first, then hot paths.
- [x] 5.1 **PERF-01 (correctness).**
  - Red test: a member with 2 OT logs and 3 standby logs in the month returns exact OT and standby totals, not multiplied ones.
  - Fix: replace the two `Sum` annotations with `Subquery(... .values('user').annotate(total=Sum('hours')).values('total'))` + `Coalesce(..., 0)`.
  - Then add the TL FK `select_related` and the `tech_assignments` prefetch. Add an `assertNumQueries` test with 1 vs 5 members: equal counts.
- [x] 5.2 **PERF-10 (correctness).**
  - Red test: an OT create through the API with a JWT bearer token produces an audit row whose actor is that user.
  - If it fails: set the thread-local user from DRF, not from Django middleware. For example, override `perform_authentication`/`initial` in a base API mixin, or a DRF authentication wrapper that calls `set_current_user`. Keep cleanup in the middleware `process_response`.
  - The middleware must stop forcing `request.user` evaluation for `/api/` paths. Verify no session query occurs on a JWT request (`CaptureQueriesContext`).
- [x] 5.3 **PERF-02/03.** Prefetch `albanian_tl`, `italian_tl`, `team_memberships__team`, `user__user_groups__group` and `tech_assignments__tech`/`__level` (check the exact relation names in the models) on `UserProfileViewSet`, `italian_team_members` and `TeamViewSet.members`. Make the serializer methods read prefetched data, with the `_prefetched_objects_cache` fallback pattern (`apps/users/serializers.py:268-290`). An `assertNumQueries` test for each, N=1 vs N=5.
- [x] 5.4 **PERF-04/05.**
  - Annotate `line_count=Count('lines')` on the run queryset; the serializer reads the annotation with a fallback.
  - For team scope, annotate a scoped `Count(filter=Q(lines__user_id__in=...))`. Totals: compute in one grouped query per page, or keep per-run if the budget test shows ≤ page size; document it.
  - Work calendar: annotate `working_day_count=Count('workdays', filter=Q(workdays__is_working_day=True))`.
  - Respect the CLAUDE.md payroll invariant: run-level aggregates stay **scoped** to `scoped_user_ids`.
- [x] 5.5 **PERF-06 (D5).**
  - Paginate `NotificationViewSet` with the default paginator. **First check the frontend consumer** (search `frontend/src` for the notifications service). It probably expects an array; update the service and hook to read `results`, and keep the unread-count endpoint.
  - Add the management command `prune_notifications --days N` (no scheduler: call it from the entrypoint gated block like `purge_hbpr_archive`, plus document a cron).
  - Tests for both.
- [x] 5.6 **PERF-07.** Find the largest legitimate `page_size` any frontend call requests (search for `page_size` in `frontend/src`). Lower `max_page_size` to that value rounded up (likely 1000-2000). Test that an oversized request is clamped.
- [x] 5.7 **PERF-08.**
  - Wrap notification creation and push in `transaction.on_commit`, so request transactions don't hold during HTTP.
  - Add a push timeout (verified API, §0.2).
  - Catch only the push library's request/timeout exceptions around each send, and log them; a failed push never fails the request.
  - Tests: an approval with a mocked push that raises a timeout still returns 200 and still creates the in-app notification.
  - `NotificationEventTypeConfig` stays uncached (CLAUDE.md invariant).
- [x] 5.8 **PERF-09.**
  - Payroll generate: prebuild the per-user inputs and `bulk_create` the lines **only if** no `PayrollLine.save()` override or signal is relied on. Check with `find_usages` and the signals first; if one is relied on, keep per-row creation and document it.
  - Finalize: keep `select_for_update` semantics. Measure the query count before and after; only optimize if safe.
  - The `PayrollRunEntry` guard and finalize invariants must stay green (`plugins/payroll/tests`).
- [x] 5.9 **PERF-11 indexes.**
  - Add `LeaveRequest` `Index(fields=['status','start_date'])` and `Index(fields=['user','start_date'])`.
  - Drop only indexes proven redundant: an FK auto-index duplicated by a single-column `Index`, or an `Index` identical to a unique constraint's columns in the same order.
  - One migration per app; `makemigrations --check` clean afterwards; then `migrate`.
  - **Never touch** `apps/users` migration `0015`.
- [ ] 5.10 **PERF-12.** If D3 means no queue: keep backup synchronous, but put a timeout or size warning in the UI copy, and document that a large MEDIA_ROOT needs a CLI backup (`manage.py` command) instead of the POST. If a management command for backup doesn't exist, add a thin one that calls the same service (test it).
- [ ] 5.11 **PERF-13/14/15.**
  - `bulk_delete`: drop the per-user `.count()` logging or make it one aggregate.
  - Importers: preload lookup dicts. Only where an existing importer test pins behaviour; keep row-error semantics.
  - Scorecard trend: measure with `CaptureQueriesContext` at 12 and 24 months. Optimize only if over 200 queries; otherwise record the number.
- [ ] 5.12 **Live-DB profiling** (open item from the 09-27 plan).
  - Run Postgres via `docker compose up -d db`, then migrate and load the e2e seed against it.
  - Run `EXPLAIN ANALYZE` (`QuerySet.explain(analyze=True)`) on the top 5 list queries: OT list, leave list, calendar events, dashboard team_stats, payroll lines.
  - Record plans; add an index only where a seq scan appears on a filter column.

**Browser verification:**
- Page Gate on My Team (TL), Users/Profiles admin list, Team member drawer, Payroll runs list + run detail (HR), Notifications bell + page (employee), Leave list/calendar (employee + TL).
- **Numbers check:** on My Team, the OT/standby monthly totals must equal the sum shown in the OT and Standby pages for the same member and month. This is the PERF-01 user-visible proof.

**Phase 5 fix record (2026-10-14).**
- PERF-01: `my_team_members` totals use one correlated `Subquery(Sum)` per relation (a member with 2 OT and 3 standby logs returned 9 instead of 3). Together with PERF-02/03 the shared recipe is `apps/users/services/profile_loading.py::with_profile_list_loading`: profile list 50 -> 25 queries flat (N=1 and N=5; was 50 -> 122), `italian_team_members` 37 -> 24 flat (was 37 -> 173), `TeamViewSet.members` 40 -> 26 flat (was 40 -> 180), `my_team_members` 25 flat. `teams_detail` is memoised per team on the serializer instance. `has_control_room_access` reads a `to_attr` prefetch (the reverse OneToOne cache is stale-prone and not trusted). `is_team_leader`/`is_*_tl` read prefetched `led_teams`/`*_team_members` through `_user_has_related`.
- PERF-10 CONFIRMED: JWT writes logged a null audit actor. `UserContextMiddleware` now stores the request and `get_current_user()` resolves `request.user` lazily (DRF's `Request.user` setter writes it back onto the HttpRequest). No session query on JWT requests.
- PERF-04/05: run `line_count` is a scoped correlated subquery (company scope flat; team scope pays at most one aggregate per run row for the recomputed totals, `aggregate_line_totals` now one query instead of two). Work-calendar `working_day_count` counts over the prefetch (3 -> 3 queries flat; was 3 -> 7).
- PERF-06 (D5): `NotificationViewSet` paginated (100 default, `page_size` up to 200). The frontend already reads `results` through `normalizeList`, so no frontend change; `unread_count` is unchanged. `prune_notifications --days 180` (read only; unread kept) runs in the gated entrypoint block; schedule it daily for a long-lived replica.
- PERF-07 REJECTED as specified: the calendar (`useCalendarEventQueries.ts`) legitimately requests `page_size=10000`, so lowering `max_page_size` would silently truncate it. Clamp pinned by test; revisit only after the calendar pages.
- PERF-08 (D3): push moved to `transaction.on_commit` with a 5 s `timeout` (pywebpush 2.5.0 `webpush(timeout=)`, forwarded to `requests`; unset it was unbounded) and only `WebPushException` / `requests.RequestException` are caught per send. In-app rows stay synchronous (they roll back with the event). Outside an atomic block `on_commit` runs inline, so the timeout is the real bound. SR-01 (task queue) stays a follow-up.
- PERF-09: kept per-row. `PayrollLine.save()` and `PayrollRunEntry.save()` are immutability guards and `finalize` relies on the source `save` signals. Measured: generate 13 queries/user, finalize 9/entry; pinned in `test_generate_finalize_budget.py`.
- PERF-11: `LeaveRequest` `(status, start_date)` and `(user, start_date)` added. Dropped as provably redundant: OvertimeLog `(client)`, PayrollLine `(run, user)` and `(user)`, CalendarWorkspace `(team)`, UserSkill `(user, skill)`, MonthlyKPI `(user, month)`. Migrations `0012_phase5_perf_indexes` (leave_management, dashboard, payroll), `0009` (overtime), `0008` (skills), `0014` (ticket_kpi). A scan found about 30 more redundant single-column FK indexes and 8 unique-duplicate indexes (users, permissions, dashboard, control_room, organigrama, payroll rule tables, reports, audit_log, ticket_kpi `TicketImportBatch` excluded); not dropped, to keep the migration blast radius small.
- PERF-12: backup stays synchronous; `manage.py create_site_backup [--note] [--no-media] [--user]` calls the same service. A large MEDIA_ROOT should use it instead of the POST.
- PERF-13/14: `bulk_delete` no longer runs 3 COUNT queries per user for log lines (157 -> 153 queries/user; the rest is Django's delete cascade). Users importer already batches leader lookups (pinned by an existing test); other importers untouched (no pinning test). Scorecard trend with a 5-member team: 12 months 106 -> 86 queries, 24 months 202 -> 160 after sharing the two calendar-year metrics across months.
- 5.12 UNVERIFIED: Docker is not available. Owner command: `docker compose up -d db`, point `DB_*` env at it, `py -3.14 manage.py migrate`, load the e2e seed, then `QuerySet.explain(analyze=True)` on OT list, leave list, calendar events, dashboard team_stats and payroll lines.

**Phase 5 fix round record (2026-10-14)**
- F1 (pagination regression): service `getNotificationPage(page)` (`?page=N`, `hasMore` from DRF `next`), `useNotificationsPage` tracks page/hasMore and dedupes by id, `NotificationsPage` shows a "Load more" button. Bell unchanged (first page + `unread_count`). Red: `NotificationsPage.loadmore.test.tsx` failed (no such method/button); green after. Backend `test_second_page_is_reachable_and_has_the_remainder` (`?page=2`) passed at once, as the backend was already correct. Browser (private backend 8001 on `config.settings_e2e` + private Vite 5174 with `VITE_API_URL`, light): e2e_employee_a has 145 rows, 100 shown, "Load more" -> 145, button gone, 0 console errors, 0 4xx/5xx. Screenshots in `design-fingerprints/prod-readiness/phase5/fix/`. Trap: the frontend talks to `host:8000` directly unless `VITE_API_URL` is set, so a Vite proxy override alone still hits the dev DB.
- F2: `prune_notifications --batch-size` (default 5000, must be >= 1) deletes by id batches. Red: unknown argument; green: 12 eligible rows with batch 5 -> exactly 3 DELETE statements; unread and recent read rows survive.
- F3: `TrendValuesMatchPerMonthTests` compares each of 24 trend points (3 calendar years, reviews and promotions in each) with an independent `build_scorecard` per month. It passed first time, so the shared-year code path is value-identical; no code change. The test also asserts the fixture produces varying values (non-vacuous).
- F4: `pypdf==6.19.0` is in `requirements.txt` and `py -3.14` has 6.19.0; `manage.py check` clean. The suite log line "Failed to load plugin tl_scorecard: No module named 'pypdf'" is emitted by `apps/plugins/test_plugin_load_failures.py:27`, which simulates the failure on purpose. Not an environment problem.
- Suite: `py -3.14 manage.py test apps plugins config` Ran 2927, OK (the previously known test_team_members failure did not occur this run). `makemigrations --check` clean, ruff clean, tsc clean, eslint clean on `src/plugins/notifications`, vitest `src/plugins/notifications` 23 passed.

---

## Phase 6: Full backend audit sweep (the modules discovery did not read deeply)

**Purpose:** the user asked to "check backend code everywhere". Discovery covered the security/perf surface broadly but **did not deeply read**: `plugins/engagement`, `plugins/organigrama`, the rest of `plugins/tl_scorecard`, `plugins/skills` (matrix/gap services), `plugins/analytics` viewsets, the bulk of `plugins/ticket_kpi/viewsets.py` (2.3k lines), `apps/dashboard/admin_overview.py`, `apps/permissions/services/permission_service.can_approve`, `PluginPermission.has_access`, and `UserProfileSerializer` field exposure.

**Skills:** for each module run, in order, `django-access-review`, `security-review`, `django-perf-review`. Run these as **parallel read-only subagents**, one per module. The agents only report; the main agent alone writes code.

**Required reading per module:** its `PLUGINS/*.md` context file (create notes if none exist; see Phase 9), its tests directory.

**Subagent prompt template** (copy for each module):
> Read-only review of `<module path>` in `C:\Users\EDEMNUSHIW\Desktop\Engineering_tracker` (Django 6.1 + DRF). Use trace-mcp (`get_outline`, `get_symbol`, `find_usages`) before raw reads, and run `graphify query` first. Apply the checklists of the skills `django-access-review`, `security-review` and `django-perf-review` (load them with the Skill tool). Report ONLY findings with exact file:line, severity H/M/L, a concrete failure scenario (role + request → wrong result), and the existing test file that should hold the regression test. Also list "senior suggestions" (maintainability/clarity) separately. Exclude anything already in this register: <paste §0.1 IDs>. Contract: sources consulted, findings with file:line, copy-ready fix patterns, confidence + gaps.

- [x] 6.1 Dispatch the subagents (max 4 at once): engagement, organigrama, tl_scorecard (excluding paths covered by `test_hbpr_invariants.py`), skills, analytics, ticket_kpi, dashboard admin aggregates, permissions services, users serializers. **Add the graphify hook rule to every prompt.**
- [x] 6.2 Merge the reports into §0.1 as new rows `SEC-1xx`/`PERF-1xx`/`SR-1xx`, after re-verifying each H/M finding yourself (read the cited lines). Reject false positives with a reason.
- [x] 6.3 Fix the confirmed H/M findings with TDD, the same way as Phases 2/5. Put L findings in §Senior findings unless trivial.
- [ ] 6.4 Run the `fallow` skill (`npx fallow dead-code`, `npx fallow dupes`) on `frontend/` and record new issues. For Python, run `python -m ruff check --select F401,F841,B --output-format=concise apps core plugins config` as a **report** (not a gate; the CI ruff set is E4/E7/E9/F) and list the real hits.
- [ ] 6.5 Optional, if time allows: run `bandit -ll -r apps core plugins config` locally (CI runs it) and triage anything not suppressed.

**Browser verification:** Page Gate on each page whose backend changed in 6.3.

---

### Phase 6 dashboard/analytics fix record

Each item was reproduced as an API test first (red), then fixed (green). Tests: `apps/dashboard/tests/test_phase6_holiday_scope.py`, `plugins/analytics/test_phase6_fixes.py`.

- D-F1 CONFIRMED. `PublicHolidayViewSet.get_queryset` now limits non-staff to calendar-null or `CalendarWorkspace.get_accessible_for_user`; the list cache key includes a hash of the viewer's accessible workspace ids (`all` for staff). `apps/dashboard/viewsets.py`.
- D-F2 CONFIRMED (HR PATCH calendar=null returned 200). Holiday reads are scoped now (404), and `perform_update` also checks `serializer.instance.calendar`.
- A-04 CONFIRMED. `permission_action_map` maps create/list/status/download export-job actions to `export`.
- A-02 CONFIRMED (pdf schedule returned success, sent nothing, advanced next_run_at). Smaller safe fix chosen: `run_now` gets the same pdf branch as `run_scheduled_reports` (`generate_pdf_report`), and returns 400 without advancing `next_run_at` when no report data is produced.
- A-01 CONFIRMED. `ScheduledReportSerializer` validates recipients (list of valid emails) and filter_preset (object; teams/users/statuses/categories lists; period/date_from/date_to strings).
- A-03 CONFIRMED (range part). `create_export_job` returns 400 for a range over 400 days, an inverted range, or non-ISO dates. Concurrency cap deferred.
- A-05 AWAITING OWNER DECISION. No behaviour change. `ExportFreeTextDocumentationTests` documents that an `export` grant holder gets org-wide per-person free text (leave reason) in the Excel raw-records sheet.
- Deferred: A-06 stuck export jobs (no reaper/timeout), A-03 thread pool / concurrency limit for background exports.

### Phase 6 permissions/users fix record

Each item was reproduced as an API test first (red for the stated reason), then fixed (green). Tests: `apps/users/tests_app/test_phase6_escalation.py`, `apps/permissions/test_phase6_privilege.py`.

- N1 CONFIRMED (staff PATCH own `is_superuser` returned 200 and flipped it; POST created a superuser). `UserSerializer` now raises `PermissionDenied` (403) when a non-superuser changes `is_staff` or `is_superuser`; unchanged values and other fields still pass.
- N2 CONFIRMED (staff POSTed user-roles, role-permissions and roles, all 201). `RoleViewSet`, `UserRoleViewSet`, `RolePermissionViewSet` copy `GroupViewSet.get_permissions`: list/retrieve `IsAdminUser`, writes `IsSuperuser`.
- N3 CONFIRMED (staff reset superuser and staff passwords, 200). `reset_password` returns 403 unless the actor is a superuser, the target is non-staff, or the target is the actor. Existing reset tests stayed green.
- N9 CONFIRMED (staff and HR approved their own leave, status became approved). `PermissionService.can_approve` refuses `obj.user == user` before the staff/HR/superuser shortcut (TL branch reuses the same check). No existing test expected admin self-approval.
- N4 CONFIRMED (`has_permission` stayed True after `revoke_role`). `revoke_role` calls `invalidate_permission_cache_for_user`, the helper the post_save signals use.
- N6 CONFIRMED (`update_user` accepted a non-TL as `italian_tl`; failed role sync kept the earlier name write). Both `update_user` and `bulk_update` validate the leader with the `set_team_leader` rule (new `UserViewSet._invalid_leader_error`, 400). `update_user` is `@transaction.atomic` with `set_rollback(True)` before its two post-write error returns. `bulk_update` was already atomic.
- N7 CONFIRMED (employee GET /teams/ returned the leader's email and `is_staff`). `TeamSerializer.team_leader` uses new `TeamLeaderSerializer` (id, username, first_name, last_name, full_name). This also covers the nested `teams_detail` on profiles. Frontend consumers read only id, username, first_name, last_name, so no frontend change; the TS `Team.team_leader` type still declares the wider `User` (cosmetic).
- Deferred (not in this round): N5, N8, N10, N11, N12, N13.

### Phase 6 scorecard/ticket_kpi fix record

Each item was reproduced as an API test first (red for the stated reason), then fixed (green). Tests: `plugins/tl_scorecard/test_phase6_findings.py` (16), `plugins/ticket_kpi/test_phase6_findings.py` (11). Suite: `manage.py test apps plugins config` 3001 OK (the known `test_leave_epr_and_governance_are_summarised_per_member` failure did not occur), `makemigrations --check` clean, ruff clean.

- S-F1 CONFIRMED (DELETE returned 204 on approved PIP, decided flag, EPR cycle with stage records, resolved idle flag, addressed absence). Each viewset's `destroy` now returns 409 unless the record is still a draft (PIP `draft` and unapproved, promotion `nominated`, EPR with no completed stage and no stage records, idle `open`, absence not addressed). Drafts stay deletable. `viewsets/decisions.py`, `epr.py`, `records.py`.
- S-F2 CONFIRMED (HBPR escalations returned `leave_pending` and a PIP subject outside the population; scorecard carried leave/overtime). `escalation_candidates(leader, subject_ids=None, include_leave=True)`; the viewset passes the HBPR scope intersection and drops leave for HBPR-only. Scorecard and trend drop `leave`/`overtime` for HBPR-only (serializer fields `required=False`) and recompute `escalation_count` under the same limits. `services.py`, `serializers.py`, `viewsets/scorecard.py`.
- S-F3 CONFIRMED. `MeetingViewSet.perform_update` refuses a changed `meeting_type`, `counterparty` or `team` (400). No existing test edited them.
- S-F4 CONFIRMED. `notes_published_at` is read-only; the server stamps it when a team meeting first gets non-blank notes (create or update), so the KPI stays reachable. Behaviour change to note: the 24h clock now starts at first save of notes.
- S-F5 CONFIRMED (duplicate PATCH raised an unhandled IntegrityError; user/year re-homed after a stage was completed). `perform_update` wraps save in `transaction.atomic()` and returns 400 on IntegrityError, and refuses user/year changes once any stage is completed.
- S-F6 CONFIRMED. The create-time window check is now `_ensure_in_window`, also run on update against the (possibly new) assignment and date.
- T-F1 CONFIRMED (`team_id` of an empty team returned company-wide totals; `user_ids=[]` meant everyone in both the client and pre-computed paths). `compute_yearly_summary` uses `is not None`; callers pass None only for admin/HR unrestricted. Note: `_get_tl_team_members` includes the TL, so a TL's own empty team is not reachable via that path; the reproducible route is `team_id`/`user_ids` resolving to an empty list.
- T-F2 CONFIRMED (months=200000 crashed with an unhandled ValueError, a 500). `_safe_months` allows 1..36, else 400; used by `trend` and `team_trend`. Frontend uses 12.
- T-F3 CONFIRMED (owner PATCH `review_status=confirmed` flipped a pending auto link). `review_status` is read-only on `TicketOvertimeLinkSerializer`; only `review` and server create set it.
- T-F4 CONFIRMED. `delete_batch` refuses a reviewed batch for TL and owner (403, same status and convention as `delete_team_batch`; the brief said 409); admin may still delete.
- Deferred (not fixed): T-F5 signal recompute, T-F6 full recompute per save, T-F7 bulk review validation, T-F8 evidence file replacement validation, T-F9 archive expansion ordering, T-F10 unassigned clients, T-F11 mean-of-means, T-F12 scoped throttle on reads, T-F13 N+1 batch lists, and all low items.
- Observed, not fixed: evidence PATCH can still re-point `assignment` to another assignment without re-running the owner check (window is now checked against it); `escalation_count` in the xlsx/pdf export is not HBPR-masked.

## Phase 7: Frontend performance and correctness spot pass (production build)

**Skills:** `vercel-react-best-practices` (React parts only; ignore Next.js-specific rules), `frontend-testing-best-practices`, `accessibility` (only if a UI change is made).

- [x] 7.1 `cd frontend && ANALYZE=true npm run build`. Record the top 10 chunks from `dist/bundle-stats.html`. Flag any heavy lib (>100KB gz) statically imported by a route page instead of on use (CLAUDE.md "Heavy feature libs need a dynamic import").
- [x] 7.2 Check `optimizeDeps.include` in `vite.config.ts` covers every dependency imported only lazily (CLAUDE.md "Plugin pages won't open").
- [x] 7.3 React Query keys include every result-changing param (CLAUDE.md invariant). Search for `queryKey:` with conditional scope strings; fix the hits with tests.
- [x] 7.4 Production preview: `npm run build` then `npx vite preview --port 4173` (proxy to the backend) or the frontend Docker image. Lighthouse-style checks through the browser: measure the `performance.getEntriesByType('navigation')` and LCP entries via `browser_evaluate` on the login page and dashboard. Record them; no fixed threshold, this is the baseline for SR follow-ups.

### Phase 7 record (2026-10-14)

- 7.1 FIXED. `vendor-recharts` (110KB gz) was preloaded by `index.html` on every page, login included. Two causes: (a) the bundler folded React and clsx into the `recharts` manualChunk, so every shell chunk imported it; (b) `DashboardPage` was statically imported in `AppRoutes.tsx` and carries the recharts cards. Fix: `vendor-react` and `vendor-clsx` manualChunks in `frontend/vite.config.ts`, and `DashboardPage` lazy in `AppRoutes.tsx` (unused `withErrorBoundary` removed). New build assertion `frontend/scripts/entry-chunk-audit.mjs` (red before, green after): `node scripts/entry-chunk-audit.mjs` after `vite build`.
- Top chunks gz, before: index 132, jspdf 126, vendor-recharts 111, organigramaService 66, html2canvas-pro 66, index.es 47, html2canvas 45, framer 44, AdminDashboardPage 36, TLScorecardPage 27. After: jspdf 126, vendor-recharts 110, organigramaService 66, html2canvas-pro 66, vendor-react 55, index.es 47, html2canvas 45, framer 44, index 41, AdminDashboardPage 36. Entry (index.html) JS: 36 chunks, 243KB gz, no recharts/jspdf/html2canvas.
- Deferred: `plugins/organigrama` statically imports `html2canvas-pro` and `jspdf` (`OrganigramaBuilderPage.tsx:70-71`, `components/viewerHelpers.ts:1`, so `organigramaService` is 66KB gz plus html2canvas 66KB on every Organigrama page visit). Not touched (another writer active). Fix is a dynamic import at the export click, as in `pdfExport.ts` usage.
- 7.2 No change. No bare-specifier `import()` exists; every lazy import is a literal relative path that Vite's scan follows. Verified empirically: a dev server on 5174 transformed all 917 non-test source files and re-optimised nothing except the test-only `@testing-library/jest-dom/vitest`.
- 7.3 No fixes needed. Conditional-scope keys: none. `userId ?? "anonymous"` keys (`useDashboardData`, `useOvertimeQueries`, `useStandbyQueries`, `useCalendarQueries`) are all `enabled`-guarded. A key/queryFn heuristic scan flagged only constant `page_size` and aliased names (`debouncedSearch`, `evidencePage`, `effectiveUserId`). `["workspaces"]` in `useWorkspaceData.ts:7` is user-specific without a user in the key but is safe because `AuthContext` calls `queryClient.clear()` on login and logout.
- 7.4 Baseline (production build, `vite preview` 5174 proxying to private e2e backend 8001, CloakBrowser, cold HTTP cache, localhost): login page TTFB 10ms, DCL 170ms, load 172ms, FCP 256ms, LCP 256ms (H1), 36 JS files 256KB transfer. Dashboard (e2e_employee_a, hard load): TTFB 10ms, DCL 224ms, load 225ms, FCP 264ms, LCP 300ms (P), 17 API calls all 2xx, recharts loaded on demand. Caveat: the build must use `VITE_API_URL=/api` and on Git Bash `MSYS_NO_PATHCONV=1`, otherwise `/api` is rewritten to `C:/Program Files/Git/api`; a registered service worker also masks bundle changes, so unregister it and clear caches between builds.
- 7.5 Page Gate: login (anonymous) and dashboard (e2e_employee_a): 0 app console errors (the 3 logged errors were the agent's own probes), every `/api/` 2xx, SPA click-through overtime, leave-management, calendar, dashboard clean. Screenshots in `design-fingerprints/prod-readiness/phase7/` (login and dashboard light/dark, dashboard 375px dark); hashes all distinct.
- Verification: `npx tsc --noEmit` 0 errors; eslint on touched files clean, `npm run lint` 0 errors (2 pre-existing warnings); full `npx vitest run` 548 files, 3501 tests passed; `npm run build` ok; `graphify update .` ok.

---

## Phase 8: CI hardening (CI-01…CI-05)

**Skills:** `e2e-testing-patterns`, `context7:docs` (GitHub Actions service containers, trivy-action, gitleaks-action; pin by version tag or SHA).
**Required reading:** `.github/workflows/ci.yml` in full.

- [x] 8.1 **CI-03.** Add `node scripts/modal-audit.mjs`, `node scripts/dashboard-audit.mjs` and `node scripts/modal-visual-audit.mjs` (if static; check its header) plus `node --test scripts/visual-fingerprint.test.mjs scripts/visual-route-manifest.test.mjs scripts/visual-capture-helpers.test.mjs scripts/admin-routes.test.mjs` to the frontend job, `working-directory: frontend`. Run each locally first and fix or record red results.
- [x] 8.2 **CI-02.** Add a backend job matrix entry with a `postgres:16` service, `DB_*` env, and a settings module that uses Postgres. A small `config/settings_ci_pg.py` importing base settings and overriding `DATABASES` from env is acceptable; check whether `settings_production` can be reused without the SSL/ALLOWED_HOSTS guards. Run the full test suite. Expect and fix sqlite-only assumptions (case-sensitive `LIKE`, ordering without `order_by`, `DISTINCT ON`), each as a separate commit with the failing test named.
- [x] 8.3 **CI-01.** Add a Playwright job: Python 3.12 + Node 22, `pip install -r requirements.txt`, `npm ci`, `npx playwright install --with-deps chromium`, `python manage.py prepare_e2e_db --settings=config.settings_e2e`, `npx playwright test --project=chromium` with the Phase 1 config. Upload the `playwright-report` artifact on failure. Mark known pre-existing failures from the Phase 1 baseline with `test.fixme` and a linked reason. Never delete them.
- [x] 8.4 **CI-04/05:**
  - `aquasecurity/trivy-action` scanning both built images (fail on CRITICAL, report HIGH).
  - `gitleaks/gitleaks-action` with a config allow-listing the e2e seed password file.
  - `docker compose config -q` with a dummy `.env`.
  - `nginx -t` on the rendered template.
  - Smoke run: start the backend image with the postgres/redis services and curl `/api/health/live/`.
  - A `schedule:` weekly workflow running `pip-audit` + `npm audit --audit-level=high` (closes P3-6 of the 08-21 plan).
- [ ] 8.5 Push the branch and read CI through the ccd_pr tools if a PR is opened (`get_status`/`bind_pr`). Do not poll manually.

### Phase 8 record (2026-10-14, implemented, NOT yet run on GitHub)

- **8.1** `ci.yml` frontend job: `Modal contract` (modal-audit + modal-visual-audit, both static), `Dashboard contract`, `Visual tooling tests` (fingerprint, capture-helpers, admin-routes: 37/37 pass locally), `Entry chunk audit` after `Build`. `visual-route-manifest.test.mjs` is **left out**: red at HEAD (manifest lacks `/hr/team-leaders` and `/engagement/metrics`; one test reads the untracked `design-audit/app-extract-pages`). Follow-up: add the rows and make that test skip when the directory is absent, then add it to the step.
- **8.2** `backend-postgres` job (postgres:16 service) with new `config/settings_ci_pg.py` (imports `config.settings`, `DATABASES` from `DB_*` env only; `settings_production` was not reused because it needs ALLOWED_HOSTS, SECRET_KEY, SSL and Redis settings that tests do not want). `continue-on-error: true` until the first run is read, commented in the file. Expected sqlite-only failures: `plugins/organigrama/tests/test_models.py` `MigrationReversibilityTestCase` (queries `sqlite_master`); possibly `apps/plugins/tests.py` (mocks `connection.vendor = 'sqlite'`), `assertNumQueries` users (7 files) and `CaptureQueriesContext` users (32 files) where query counts differ, any FK-violating hard-coded ids (Postgres checks FKs at commit), and varchar length overruns (SQLite does not enforce `max_length`).
- **8.3** `e2e` job. Found and fixed a CI blocker: `frontend/playwright.config.ts` started Django with `python ..\\manage.py`, which fails on Linux; it is now `python ../manage.py` (also valid on Windows). The 160-test suite was only listed (`--list`), not run, because ports 8000/5173 hold the developer's servers. No `test.fixme` added.
- **8.4** `image-scan` (trivy-action v0.36.0, HIGH reported, CRITICAL gates, `ignore-unfixed`), `gitleaks` (gitleaks-action v2.3.9 plus `.gitleaks.toml`: default rules, allow-list = the literal `e2e_pass_2026` and four named files), `deploy-config` (compose config with an env file in `$RUNNER_TEMP`, `nginx -t` twice via the official entrypoint), `smoke` (backend image + postgres + redis, `/api/health/live/` and `/ready/`), `.github/workflows/security-weekly.yml` (Monday 05:17 UTC + manual: pip-audit, npm audit).
- **Deferred:** SR-11 pin every third-party action by SHA (currently major/exact tags: checkout@v4, setup-node@v4, setup-python@v5, upload-artifact@v4, trivy-action@v0.36.0, gitleaks-action@v2.3.9); treat trivy-action with extra care until pinned.
- **Proven only on GitHub:** every job except `frontend` additions, which also ran locally. See the CI step names above.

---

## Phase 9: Workflow and documentation refresh (DOC-01…DOC-12)

**Skills:** `claude-md-management:claude-md-improver` (audit first), `writing-guidelines` (prose), `claude-md-management:revise-claude-md` (final).
**Rule:** docs describe the code **as it is after Phases 2-8**. Do this phase after them and re-verify every symbol or line you cite (`mcp__trace__search` / `get_symbol`). No line numbers in CLAUDE.md where a symbol name works.

- [ ] 9.1 **CLAUDE.md (DOC-01, 02, 04, 05, 12):**
  - Leave invariant: rewrite to `count_leave_days`/`count_request_days` + `days_counted` snapshot + carry-over (summary + link to `docs/superpowers/plans/2026-10-13-leave-carryover-and-holidays.md`).
  - Task Router rows: notifications (kill-switch, push, retention), onboarding/OnlyOffice, audit_log, leave carry-over, production deploy (→ new `docs/deploy/`).
  - Merge the payroll bullets into one.
  - Merge the three admin-lift bullets into one current rule (`RowActionsPill`), dropping superseded text.
  - Resolve the payroll-`view` contradiction by reading `plugins/payroll` permission code and stating the truth.
  - Delete the point-in-time "gate state at handoff" sentence.
  - Fix the garbled formula-prefix text: write it as "`=`, `+`, `-`, `@`, tab, carriage return".
  - Bold the unbolded bullets.
  - Replace line refs with symbol names.
  - Prefix the audit commands with `cd frontend &&`.
  - Python version statement: "dev uses `py -3.14`; production image is 3.12; CI 3.12".
  - Add Hot Invariants learned in this plan: throttle rates explicit in prod settings; `protected_media` deny-by-default map; audit actor set from DRF auth; notification pagination.
  - Target: CLAUDE.md **smaller** than today (54.5KB), measured with `wc -c`.
- [x] 9.2 **`docs/workflow-invariants.md`:** same leave fix. E2E section: the Phase 1 recipe and all 11 seed users (names only).
- [ ] 9.3 **`.devin/context/12-VISUAL-VERIFICATION.md` (DOC-06):** replace "needs no manual setup" with the real recipe (settings_e2e, `prepare_e2e_db`, the `backend-e2e` launch config, CloakBrowser vs built-in browser), and the Page Gate from this plan.
- [ ] 9.4 **New context files (DOC-03):** `.devin/context/PLUGINS/10-notifications.md`, `11-onboarding.md`, `12-audit-log.md`, `13-analytics.md`. Each has purpose, models, endpoints + permissions, invariants and tests, built from Phase 6 notes. Add `09-engagement.md` and the new files to `00-INDEX.md`, and update `PROJECT_INDEX.md` plugin list. These are local (gitignored); also add a short tracked summary section to `docs/workflow-invariants.md` so other clones get the essentials.
- [x] 9.5 **`.claude/hooks/context-router.ps1` (DOC-09):** add the missing routes.
- [x] 9.6 **README (DOC-08):** fix links, the plugin list (13), the deploy section (D1 outcome, `docs/deploy/` runbook) and the e2e section. Remove the stale audit date or replace it with a link to this plan's outcome.
- [x] 9.7 **`AGENTS.md` (DOC-10):** add the 2026-10-13 entries (from `git log faf475c 06173d9`) and a 2026-10-14+ entry for this plan's outcome with verification counts (protocol `11-PLAN-CREATION.md` §11).
- [ ] 9.8 **DOC-11:** delete `shot-audit.mjs`/`shot-flows.mjs` after confirming nothing imports them (search `frontend/` and `package.json`).
- [x] 9.9 **New tracked `docs/deploy/production-runbook.md`:** env var table (from `.env.example` + settings), first deploy, upgrade (`RUN_MIGRATIONS`), backup/restore drill, log access, health checks, rollback, incident contacts placeholder (P3-5 of the 08-21 plan).
- [ ] 9.10 Update `.devin/plans/plan-production-security-2026-08-21.md` and `plan-security-perf-cache-audit-2026-09-27.md` headers: mark the items this plan closed, with a link here.
- [ ] 9.11 Update the memory index if a durable lesson emerged (for example "prod throttles were silently off because base settings computed rates from DEBUG"), following the memory rules.

**Verification (grep checks; each must print nothing):**
```bash
grep -n "count_business_days" CLAUDE.md docs/workflow-invariants.md
grep -n "needs no manual setup\|starts BOTH servers" .devin/context/12-VISUAL-VERIFICATION.md
grep -n "agent-dispatch.md\|CHANGES_OPTIMIZED" README.md
grep -n "permissions.py:536\|Sidebar.tsx:130\|AdminSidebar.tsx:165" CLAUDE.md
grep -n "cr_admin: null" frontend/scripts/visual-route-manifest.mjs
```

---

## Phase 10: Production rehearsal (local, real stack)

**Skills:** `run` (launch patterns), `anthropic-skills:built-in-browser` or CloakBrowser, `superpowers:verification-before-completion`.

- [ ] 10.1 Create a local `.env.rehearsal` (never committed) from `.env.example`: a strong random `SECRET_KEY` (generated, not typed into chat), `ALLOWED_HOSTS=localhost,127.0.0.1`, `FRONTEND_URL=http://localhost:8080`, DB/Redis passwords.
  - Prod settings force `SECURE_SSL_REDIRECT`. For a local rehearsal, either put a local TLS proxy in front, or send `X-Forwarded-Proto: https` from nginx for this run only. Record which; never commit a rehearsal-only change.
- [ ] 10.2 `docker compose --env-file .env.rehearsal up -d --build`. All services must be healthy (`docker compose ps`). `docker logs` must show app logs (DEP-03 proof).
- [ ] 10.3 `curl -i http://localhost:8080/api/health/ready/` returns 200. Check response headers for HSTS/CSP/nosniff/`Server` with no version.
- [ ] 10.4 Seed: `docker compose exec backend python manage.py seed_e2e_data` **only** into the rehearsal DB (it is a throwaway volume; remove it after with `docker compose down -v`, and confirm with the user first because `-v` deletes volumes).
- [ ] 10.5 Browser through nginx (`http://localhost:8080`): log in as each of the 11 roles and run the Page Gate on the dashboard plus each role's primary page:
  - employee: OT, standby, leave
  - TL: approvals, My Team, scorecard
  - HR: HR reports, `/hr/payroll`, `/hr/holidays`
  - admin: users, teams, plugins, notifications config
  - super: site backup
  - CR: control room
  - HBPR: `/hbpr`
- [ ] 10.6 Throttle proof (SEC-01): 25 rapid bad logins against `/api/auth/token/` (curl loop) return 429 after 20. Also confirm `/admin/login/` returns 503/429 from nginx past its burst.
- [ ] 10.7 Media proof (SEC-03): as an employee in the browser, a backup file URL returns 403/404, and an own evidence file downloads.
- [ ] 10.8 Backup/restore drill: create a backup in the UI as `e2e_super`, run the restore preview, and confirm the classification matches. Run the DEP-07 scheduled backup once and confirm a file and the retention.
- [ ] 10.9 `docker compose down -v` (after user confirmation) and delete `.env.rehearsal`.

---

## Phase 11: Final verification

- [ ] 11.1 Full pass once (§Verification commands). Compare with the Phase 1 baseline: no new failures. The pre-existing ones are listed with status.
- [ ] 11.2 Anti-pattern greps (each prints nothing, except documented exceptions):
```bash
grep -rn "if not DEBUG else None" config/settings_production.py
grep -rn "except Exception" apps core plugins --include=*.py | grep -i "permission\|access\|import" | grep -v tests
grep -rn "startswith(\"http\|startswith('http" apps core plugins --include=*.py | grep -v tests
grep -rn "csv.writer(" apps plugins --include=*.py | grep -v "tests\|csv_safe"
grep -rn "pagination_class = None" plugins/notifications
```
- [ ] 11.3 Role sweep: the Page Gate for all 11 roles on their primary pages (dev or e2e stack). Diff against the Phase 1 screenshots; differences must be explainable by a phase change.
- [ ] 11.4 Run the `review` skill (or `code-review` at high effort) on the cumulative diff vs the starting commit `7603af5`. Triage findings.
- [ ] 11.5 Update §0.1: every row is FIXED (with test name), REJECTED (with reason), or DEFERRED (moved to §Senior findings with an owner decision).
- [ ] 11.6 Outcome section: tick the 8 success criteria with evidence links.

---

## Senior findings and suggestions (beyond the fix list)

These are improvements a senior reviewer would push for. They are **not** in scope unless the user promotes them. Each has a concrete first step.

| ID | Suggestion | Why | First step |
|---|---|---|---|---|
| SR-01 | Introduce a task queue (RQ on the existing Redis is the lightest; Celery if scheduling is needed) | Push fan-out, backups, large exports and imports, engagement snapshot refresh and the D5 pruning all belong off the request path. Today the only "scheduler" is lazy on-read work and boot commands. | Spike: move `send_push` + `create_backup` to RQ jobs behind a setting flag; measure p95 of approval requests. |
| SR-02 | One authoritative audit log | Two AuditLog models exist (`apps/reports/models/core.py:~163` and `plugins/audit_log/models.py:~122`). Plus PERF-10 (actor possibly lost). | Decide which is canonical; migrate writes; read-only views over the other. |
| SR-03 | Request-ID + structured JSON logs | Correlate nginx, gunicorn and Django lines per request; essential once Sentry is in. | Small middleware setting `request.id` from `X-Request-ID` (nginx `$request_id`), added to the log formatter. |
| SR-04 | Replace thread-local "current user" with explicit passing | Thread-locals break under async views and are why PERF-10 exists. | Pass `actor` from `perform_create`/`perform_update` into services and signals via `instance._actor`. |
| SR-05 | Split CLAUDE.md | 54KB of always-loaded Hot Invariants costs every session and invites contradictions (DOC-04). | Keep the top 15 cross-cutting invariants. Move domain bullets into their routed context files and leave a one-line pointer. |
| SR-06 | Make `.devin/context` tracked, or mirror it | The Task Router points at gitignored files, so other clones (and CI agents) get dead links. | Move the plugin context files to `docs/context/` (tracked); keep `.devin/` for personal notes. |
| SR-07 | Permission matrix test generated from the URLconf | SEC-05/06/07 were all "new endpoint, forgot scoping". A single parametrized test that hits every list/retrieve route as each of the 11 seeded roles and asserts no foreign rows would catch the class. | Start from `apps/permissions/test_api_surface.py`; add a row-ownership assertion. |
| SR-08 | Soft-delete consistency | `is_deleted` has no index and no default manager filter; only engagement filters on it. A soft-deleted row may appear in other reports. | Audit which models are soft-deleted in practice; add a `ActiveManager` where needed, with tests. |
| SR-09 | Remove the unused `core/middleware/cache_stats.py`, or register it under a debug flag | Dead code. | `find_usages`, then delete. |
| SR-10 | Data-retention policy for PII exports | `analytics_exports/` and backups accumulate in MEDIA_ROOT forever. | Retention command + runbook entry, same pattern as `prune_notifications`. |
| SR-11 | Pin GitHub Actions by SHA and enable Dependabot | Supply-chain hardening for CI. | `.github/dependabot.yml` for pip, npm, github-actions, docker. |
| SR-12 | Postgres-specific wins once CI is on Postgres | `select_for_update(skip_locked=True)` for payroll finalize contention; `CREATE INDEX CONCURRENTLY` migrations (`AddIndexConcurrently`) for large tables. | Only after CI-02 is green. |
| SR-13 | Frontend: route-level error boundary telemetry | Pair with Sentry browser SDK if D4 is approved. | Decide with D4. |
| SR-14 | Repo root cleanup | Untracked clutter (`db.sqlite3.bak-*`, `session_diff.patch`, three `C:Users…` logs, `perf_run.log`, `time_tracker_export.json`, the xlsx) confuses tools and nearly leaked into the image (DEP-01). | Ask the user, then move it to a local `_archive/` outside the repo. |

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|---|
| A scoping fix (SEC-05/06) breaks a page a legitimate role relies on | Before each change, search the frontend consumers (`find_usages`, `frontend/src/services`); Page Gate the consumer pages as each affected role. |
| Notification pagination (PERF-06) breaks the bell UI | Change service + hook in the same phase; vitest for the hook; browser check of the bell and page. |
| `CONN_MAX_AGE` exhausts Postgres connections at scale | Document workers × replicas ≤ `max_connections` − headroom; env-driven `DB_CONN_MAX_AGE`. |
| Redis `IGNORE_EXCEPTIONS` makes throttles fail open during an outage | Accepted and documented; nginx admin-login limit remains; DEP-09 adds an nginx `/api/` limit. |
| Postgres CI exposes many sqlite-only test assumptions | Separate commits per root cause; do not block other phases. The CI job can be `continue-on-error` only until the fixes land, and that must be stated in the PR. |
| Index migration on big production tables locks writes | Tables are small today; for the future see SR-12 (`AddIndexConcurrently`). |
| The e2e seed accidentally runs on the dev DB | Phase 1.2 fix + anti-pattern guard + mtime proof. |
| Rehearsal `down -v` deletes the wrong volumes | The compose project name is checked first; ask the user before `-v`. |

---

## Verification commands

```bash
# Iterating (targeted)
py -3.14 manage.py check
py -3.14 manage.py test apps.<app>.<module>
py -3.14 manage.py test plugins.<plugin>.<module>
cd frontend && npx vitest run src/<path> && npx eslint src/<path>

# Full pass (once per phase end, and in Phase 11)
py -3.14 manage.py makemigrations --check
py -3.14 manage.py test
python -m ruff check --output-format=concise <changed .py files>
py -3.14 manage.py check --deploy --settings=config.settings_production
cd frontend && npx tsc --noEmit && npx vitest run && npm run build
cd frontend && node scripts/table-header-audit.mjs && node scripts/control-audit.mjs --strict --exclude=src/plugins/engagement && node scripts/surface-audit.mjs --strict --exclude=src/plugins/engagement && node scripts/modal-audit.mjs
cd frontend && npx playwright test --project=chromium
```
`check --deploy` needs the CI env block (`.github/workflows/ci.yml:134-146`) exported first. Playwright needs the Phase 1 settings fix and `prepare_e2e_db --settings=config.settings_e2e`.

## Do-not-touch list
- `apps/users` migration `0015` (`UserTech`, `SeparateDatabaseAndState`).
- `src/theme/tokens.test.ts` pinned values, `frontend/src/components/ui/tableStyles.ts` header contract, `button.tsx` variants: out of scope.
- `site_backup` `dumpdata` flags (no `natural_*`).
- `PluginContext.tsx` / `usePluginPermissions.ts` `refetchOnWindowFocus: true` exceptions.
- `NotificationEventTypeConfig` uncached read.
- Order of `sync_plugins` → `seed_plugin_permissions` → `grant_hbpr_plugin_access` in the entrypoint.
- User-owned local files: `.env*`, `.vapid_keys.json`, `db.sqlite3*`, `opencode.json`, `skills-lock.json`.
