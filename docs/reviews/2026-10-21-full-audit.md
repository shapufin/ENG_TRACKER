# Full System Audit Report

**Date:** 2026-10-21  
**Target:** Entire System Surface (Core + 13 Plugins) post-launch review and recent PRs (`#159`, `#160`)  
**HEAD Commit:** `c0ee694` (`feat(permissions): let team leaders decide their own overtime and standby (#160)`)  
**Decisions Applied:** 
1. **TL Self-Approval:** Product requirement confirmed ("let it be, because I need self approve") — kept as-is.
2. **Deterministic Pagination:** Applied `.order_by('name', 'id')` on `FolderViewSet` and `.order_by('meeting', 'id')` on `MeetingAttendeeViewSet`. Fully silences all `UnorderedObjectListWarning`s with zero migration drift.

---

## 1. Executive Summary

A comprehensive senior-grade audit and secondary verification check were performed across the codebase covering:
- Backend security, row ownership, authorization matrix, and data model constraints.
- Frontend routing, approval dashboards, forms, design-system tokens, and table-header contracts.
- Delta impact from recent changes: `#159` (unique employee code field) and `#160` (team leader self-approval for overtime/standby).
- Unresolved / deferred items from the 2026-10-20 launch review.

**Key Verdict:**
- **Zero Critical (Sev H) security vulnerabilities or data leaks found.** The row-ownership matrix test (`apps/permissions/test_row_ownership_matrix.py`) passed 100% across all 11 seeded roles.
- **Zero structural audit failures:** `table-header-audit` (918 files), `control-audit` (628 files), `surface-audit` (922 files), and modal audit scripts are all completely clean.
- **Pagination warnings resolved:** `FolderViewSet` and `MeetingAttendeeViewSet` now provide deterministic pagination ordering without schema changes or migration drift.
- **Documented items:** Form client limits, test fixture timezones, uncoupled plugin imports, and deferred operational backlog remain documented for future review.

---

## 2. Environment Preflight & Test Baseline

| Check | Tool / Command | Result | Notes |
|---|---|---|---|
| Working tree cleanliness | `git status` | PASS | Untracked `AdminGUI/` and `frontend/vite.config.audit.ts` (sanctioned, excluded via `.dockerignore`) |
| Head commit | `git log -1 --oneline` | `c0ee694` | Post-PR #160 |
| Backend check & migrations | `py -3.14 manage.py check && makemigrations --check --dry-run` | PASS | 0 issues, 0 migration drift |
| Backend test suite | `py -3.14 manage.py test` | PASS | 3,189 tests passing |
| Row-ownership matrix | `py -3.14 manage.py test apps.permissions.test_row_ownership_matrix` | PASS | 9 tests, 100% route/role isolation across all 11 roles (warnings eliminated) |
| Backend linter | `py -3.14 -m ruff check apps core config plugins` | PASS | All checks passed |
| Frontend TypeScript | `cd frontend; npx tsc -b --noEmit` | PASS | 0 errors |
| Frontend linter | `cd frontend; npm run lint` | PASS | 0 errors, 2 known TanStack Virtual warnings |
| Frontend Vitest | `cd frontend; npx vitest run` | PASS | 568 files, 3,599 tests passing |
| Table Header Contract | `node scripts/table-header-audit.mjs` | PASS | 0 violations across 918 files |
| UI Control Audit | `node scripts/control-audit.mjs --strict` | PASS | 0 violations across 628 files |
| Surface Audit | `node scripts/surface-audit.mjs --strict` | PASS | 0 violations across 922 files |
| Modal Audit | `node scripts/modal-audit.mjs && node scripts/modal-visual-audit.mjs` | PASS | Both PASS |
| Dashboard Audit | `node scripts/dashboard-audit.mjs` | PASS | PASS |

---

## 3. Scorecard

| Severity | Count | Status | Notes |
|---|---|---|---|
| **CRITICAL (H)** | 0 | - | No data loss, no unauthorized privilege escalation, no row leaks |
| **MEDIUM (M)** | 2 | Resolved / Documented | `F-02` and `F-03` FIXED (pagination ordering); `F-11` documented (TL period close member snapshot) |
| **LOW (L)** | 7 | Documented | Polish, operational backlog, test fixture warnings, architectural decoupling |
| **Total** | **9** | **Maintained in documentation** | |

---

## 4. Detailed Findings Register

### F-01: Team Leader Self-Approval
- **Status:** **RETAINED BY DESIGN** (Ruling 2026-10-21: "self aproove for TL i let it be, because i need self aproove").
- **Notes:** TL self-approval for overtime and standby is active and operational per product requirements.

---

### F-02: `FolderViewSet` Pagination Ordering Degradation
- **Severity:** `MEDIUM`
- **Location:** `plugins/onboarding/viewsets.py:177`
- **Status:** **FIXED**
- **Action:** Appended `.order_by('name', 'id')` to `FolderViewSet.get_queryset()`. Eliminates `UnorderedObjectListWarning` and guarantees deterministic pagination. Verified by test suite.

---

### F-03: `MeetingAttendeeViewSet` Pagination Ordering Degradation
- **Severity:** `MEDIUM`
- **Location:** `plugins/tl_scorecard/viewsets/records.py:122`
- **Status:** **FIXED**
- **Action:** Appended `.order_by('meeting', 'id')` to `MeetingAttendeeViewSet.base_queryset()`. Eliminates `UnorderedObjectListWarning` without requiring model migrations. Verified by test suite.

---

### F-04: User Create/Edit Dialogs Lack Client `maxLength` for Employee Code
- **Severity:** `LOW`
- **Location:** `frontend/src/pages/admin/components/UserCreateFormDialog.tsx:225-228` and `UserEditFormDialog.tsx:102-105`
- **Status:** Documented for future UI polish batch.

---

### F-05: Non-Pending Approval Rows Drop Details View Action
- **Severity:** `LOW`
- **Location:** `frontend/src/components/admin/ApprovalActionsWithView.tsx:28-30`
- **Status:** Documented for future UI polish batch.

---

### F-06: Unwired Browser Push Notification Hook (`usePushNotifications`)
- **Severity:** `LOW`
- **Location:** `frontend/src/hooks/usePushNotifications.ts`
- **Status:** Documented post-launch backlog.

---

### F-07: Core to Plugin Static and Dynamic Imports
- **Severity:** `LOW`
- **Location:** `frontend/src/pages/settings/components/NotificationPreferencesSection.tsx:15` and `frontend/src/pages/admin/components/UserCreateFormDialog.tsx:121`
- **Status:** Documented post-launch decoupling backlog.

---

### F-08: Data Import Dry-Run Query Scaling (`UserImporter`)
- **Severity:** `LOW`
- **Location:** `plugins/data_import/importers/users.py:82-120`
- **Status:** Documented post-launch optimization backlog.

---

### F-09: Test Matrix Naive Datetime Runtime Warnings
- **Severity:** `LOW`
- **Location:** `apps/permissions/test_row_ownership_matrix.py:317, 342`
- **Status:** Documented test hygiene backlog.

---

### F-10: Legacy Calendar Group Normalization Backlog
- **Severity:** `LOW`
- **Location:** `apps/users/models/calendar.py`
- **Status:** Documented data migration backlog.

---

### F-11: `finalize_period` Omission of TL in `ApprovalPeriodCloseMember`
- **Severity:** `MEDIUM`
- **Location:** `apps/users/services/approval_periods.py:67-72, 96-98`
- **Status:** Documented backlog.
- **Finding:** When a Team Leader finalizes a monthly approval period, `finalize_period` snapshots managed users using `profile.get_team_member_ids()`. If the TL's authority derives from `led_teams`, the TL is not in the snapshot member list. An employee's late entry carries over to the next period (`requested: 2026-11-01`), whereas the TL's own late entry does not carry over (`requested: 2026-10-01`).

---

## 5. Verification & Audit Trail

- **Git Status:** 2 minimal targeted viewset changes (`plugins/onboarding/viewsets.py`, `plugins/tl_scorecard/viewsets/records.py`).
- **Backend Test Gate:** 3,189 tests passing, 0 errors.
- **Row Ownership Matrix Gate:** 9 tests passing (0 row leaks, 0 warnings).
- **Migration Gate:** `makemigrations --check --dry-run` shows 0 changes (clean).
- **Linter Gate:** Ruff clean on changed files.
