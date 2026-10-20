# Launch review, 2026-10-20

## Scope

Delta review of `b4d48ac..HEAD` (64 commits since the 2026-10-14 production-readiness programme, #117; 65 at baseline time because the plan commit `f589304` is included). Plan: `docs/superpowers/plans/2026-10-20-launch-review.md`. Baseline taken on branch `chore/launch-review-plan` at `f589304`, Windows, Python 3.14 + Django 6.1.1.

## Baseline

| Check | Command | Result | Notes |
|---|---|---|---|
| Migrations applied | `py -3.14 manage.py migrate`; `showmigrations \| grep "\[ \]"` | PASS | No migrations to apply; 0 unapplied. |
| Django check | `py -3.14 manage.py check` | PASS | 0 issues. |
| Migration drift | `py -3.14 manage.py makemigrations --check --dry-run` | PASS | No changes detected. |
| Deploy check | `check --deploy --settings=config.settings_production` with the CI env block | PASS | 0 issues. Local run logged "Could not load dynamic plugin URLs" (no Postgres on localhost:5432); same as CI-style env, not a failure. |
| Backend suite (SQLite) | `py -3.14 manage.py test -v 1` | PASS | 3139 tests, OK, 269 s. Zero failures locally. See B-01: CI on main fails 7 tests the same suite passes here. |
| Backend suite (Postgres) | `config/settings_ci_pg.py` | NOT RUN locally | No Postgres reachable on localhost:5432. CI run 39332492412 on main: 3139 tests, 7 failures, 9 skipped (same 7 as SQLite CI). |
| Ruff | `python -m ruff check --output-format=concise apps core config plugins` | PASS | All checks passed. |
| tsc | `npx tsc -b --noEmit` | PASS | 0 errors. |
| ESLint | `npm run lint` | PASS | 0 problems. |
| Vitest | `npx vitest run` | PASS | 567 files, 3597 tests, all passed. |
| Build | `npm run build` | PASS | |
| Entry chunk audit | `node scripts/entry-chunk-audit.mjs` | PASS | 36 entry JS chunks, no heavy libs. |
| table-header-audit | `node --test scripts/table-header-audit.test.mjs && node scripts/table-header-audit.mjs` | PASS | 33 tests; 0 violations across 918 files. |
| control-audit | test file + `control-audit.mjs --strict` | PASS | 55 tests; 0 violations across 628 files. |
| surface-audit | test file + `surface-audit.mjs --strict` | PASS | 54 tests; 0 violations across 922 files. |
| modal-audit + modal-visual-audit | `node scripts/modal-audit.mjs && node scripts/modal-visual-audit.mjs` | PASS | Both PASS. |
| dashboard-audit | `node scripts/dashboard-audit.mjs` | PASS | |
| npm audit | `npm audit --audit-level=high` (frontend) | PASS | 0 vulnerabilities. |
| pip-audit | `pip-audit -r requirements.txt -r requirements-production.txt` | NOT RUN | The installed pip-audit runs on Python 3.11, which cannot resolve `Django==6.1.1` (needs >=3.12). Covered by the Security weekly workflow. |
| CI on main | `gh run list --branch main --limit 5` | FAIL (latest) | Latest CI (run 39332492412, #157, 2026-10-19 22:05 UTC) failed: Backend and Backend (PostgreSQL 16) jobs, 7 test failures. The other 4 recent CI runs succeeded. All other jobs in the failed run passed (Frontend, E2E, Docker build, Trivy, gitleaks, Security scan, compose/nginx, image smoke). |
| Security weekly | `gh run list` | PASS | Latest run 39240729597 (2026-10-19 10:53 UTC) success. |
| `.dockerignore` excludes `AdminGUI/` | root `.dockerignore` and `frontend/.dockerignore` | NO | Neither file mentions `AdminGUI`. The directory is untracked, so a Docker build context on a dirty tree would include it. See B-02. |

## Findings register

| ID | Sev | Location | Finding | Evidence | Status |
|---|---|---|---|---|---|
| B-01 | M | `apps/dashboard/tests/test_team_leader_widgets.py` (`TeamStatsActiveOperatorCountTests`); `plugins/tl_scorecard/test_hbpr_governance_evidence.py` (`EvidenceCadenceStatusTests`, `EvidenceWriteGuardTests`); `plugins/tl_scorecard/test_tl_scorecard_actions.py` (`IdleAndAbsenceActionTests`, `PipTransitionTests`) | Latest CI on main is red: 7 tests fail on SQLite and on PostgreSQL. Six are clearly date-boundary failures (the dashboard `3 != 2` is probably the same, unconfirmed): CI ran at 22:06 UTC, when `Europe/Tirane` is already the next day (2026-10-20) but the tests compute "today" in UTC or Django `TIME_ZONE` (2026-10-19). Code under test uses Tirane dates; tests are not clock-independent. Passes locally (run at 18:4x WEST). Needs a fix before CI is trustworthy; whether any production code path has the same UTC/Tirane mismatch is for the correctness phase. | CI run 39332492412 `--log-failed`: `3 != 2`; `'overdue' != 'due'`; `201 != 400` (future-dated evidence accepted); `date(2026,10,20) != date(2026,10,19)` x2; `('resolved', 2026-10-20) != ('resolved', 2026-10-19)`; `('completed', 2026-10-20) != ('completed', 2026-10-19)`. Log: `.superpowers/sdd/2026-10-20-launch-review/logs/ci-failed.log`. | OPEN – pre-existing |
| B-02 | L | `.dockerignore`, `frontend/.dockerignore` | `AdminGUI/` (untracked mockup directory) is not excluded from the Docker build context. | `grep -in admingui` on both files returns nothing. | OPEN – pre-existing |

Failing tests (CI, identical on SQLite and PostgreSQL):
- `apps.dashboard.tests.test_team_leader_widgets.TeamStatsActiveOperatorCountTests.test_active_operator_count_excludes_users_on_approved_leave_or_standby_today`
- `plugins.tl_scorecard.test_hbpr_governance_evidence.EvidenceCadenceStatusTests.test_cadence_status_reports_due_on_the_exact_due_date`
- `plugins.tl_scorecard.test_hbpr_governance_evidence.EvidenceWriteGuardTests.test_future_dated_evidence_is_rejected`
- `plugins.tl_scorecard.test_tl_scorecard_actions.IdleAndAbsenceActionTests.test_absence_address_sets_the_date_once`
- `plugins.tl_scorecard.test_tl_scorecard_actions.IdleAndAbsenceActionTests.test_idle_resolve_sets_status_and_date_together`
- `plugins.tl_scorecard.test_tl_scorecard_actions.PipTransitionTests.test_owner_tl_can_complete_an_active_pip`
- `plugins.tl_scorecard.test_tl_scorecard_actions.PipTransitionTests.test_staff_can_return_a_draft_pip_with_a_reason`

## Go/no-go

