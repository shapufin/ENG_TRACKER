# Notifications System Full Audit Report

**Date**: 2026-10-29  
**Repository Branch**: `fix/hr-isolation`  
**HEAD Commit**: `45f5458`  
**Audit Scope**: Notification plugin backend, signals, delivery rules, admin kill-switch, user preferences, role scopes, and frontend UI.

---

## 1. Executive Summary

A comprehensive senior audit and live database/signal simulation was conducted across the notification system. The audit successfully identified the root causes behind:
1. Why submitting an edit to your own record still triggers notifications (even after disabling submit/edit notification preferences).
2. Why edits to Overtime and Standby logs never trigger any notifications.
3. Why Team Leaders are never notified when an approved record is modified and reset to pending.
4. Why notification types toggle off in Admin settings vanish entirely from User settings rather than showing clear status.
5. Why clicking "Mark read" in the notification bell drawer navigates the user away.

---

## 2. Verified Simulation Evidence

A multi-role simulation script was executed (`scratch/run_audit_sim.py`) testing interactions for **Regular Employees**, **Team Leaders**, **HBPR (Oversight)**, and **Admin / Superusers**.

### 2.1 Database State Discovered During Simulation
Inspection of `NotificationEventTypeConfig` (global admin kill-switches) revealed:
- `own_leave_submitted`: **`is_enabled = False`** (Disabled globally)
- `own_leave_edited`: **`is_enabled = False`** (Disabled globally)
- `own_leave_updated`: **`is_enabled = True`** (Enabled globally)
- `own_overtime_submitted`: **`is_enabled = False`** (Disabled globally)
- `own_overtime_updated`: **`is_enabled = True`** (Enabled globally)
- `own_standby_submitted`: **`is_enabled = False`** (Disabled globally)
- `own_standby_updated`: **`is_enabled = True`** (Enabled globally)

Inspection of `NotificationPreference` for user `enri.demnushi` (Team Leader):
- `own_leave_edited`: `in_app = False`, `push = False`
- `own_overtime_submitted`: `in_app = False`, `push = False`
- `own_overtime_updated`: `in_app = False`, `push = False`
- `own_standby_submitted`: `in_app = False`, `push = False`
- `own_standby_updated`: `in_app = False`, `push = False`
- `own_leave_updated`: `in_app = True` (Default enabled)

### 2.2 Live Simulation Execution Results
```text
=== SIMULATION RUN OUTPUT ===
Testing with user: enri.demnushi, TL: andrea.negro

--- A1. LeaveRequest Created (sick) (count = 1) ---
  [To: andrea.negro] WARNING: 'Action Required: New Leave Request' | Enri Demnushi submitted a leave request for 2026-12-07.
  (Author received 0 notifications because own_leave_submitted is disabled)

--- B1. LeaveRequest Edited while PENDING (count = 0) ---
  (Author received 0 notifications because own_leave_edited is disabled)
  (Team Leader received 0 notifications: no team edit signal exists)

--- C1. LeaveRequest Approved then Edited (reset to pending) (count = 1) ---
  [To: enri.demnushi] WARNING: 'Leave Request Updated' | Your leave request for 2026-12-09 is now pending.
  (Team Leader andrea.negro received 0 notifications!)

--- D1. OvertimeLog Created (pending) (count = 1) ---
  [To: andrea.negro] WARNING: 'Action Required: New Overtime Log' | Enri Demnushi submitted overtime for 2026-10-15 (2h).

--- E1. OvertimeLog Edited while PENDING (count = 0) ---
  (Neither author nor TL received any notification: Overtime has no edit tracking)

--- F1. OvertimeLog Approved then Edited (reset to pending) (count = 0) ---
  (Author disabled own_overtime_updated; TL received 0 notifications)

--- G1. StandbyLog Created (pending) (count = 1) ---
  [To: andrea.negro] WARNING: 'Action Required: New Standby Log' | Enri Demnushi submitted standby for 2026-10-16.

--- G2. StandbyLog Edited while PENDING (count = 0) ---
  (Neither author nor TL received any notification: Standby has no edit tracking)

--- G3. StandbyLog Approved then Edited (reset to pending) (count = 0) ---
  (Author disabled own_standby_updated; TL received 0 notifications)
```

---

## 3. Detailed Audit Findings

### Finding F1 (CRITICAL): Spurious "Updated: Now Pending" Notification to Author on Submit of Approved Record
- **Files**:
  - `plugins/notifications/signals.py:170-173`
  - `apps/leave_management/viewsets.py:399-402`
  - `apps/overtime/viewsets.py:299-302`
  - `apps/standby/viewsets.py:194-195`
- **Symptom**:
  When a user edits an approved Leave, Overtime, or Standby record and clicks "Submit" in the modal, they unexpectedly receive a notification:
  > **Leave Request Updated**: *Your leave request for 2026-12-09 is now pending.* (Warning severity)
- **Root Cause**:
  When an approved record is modified, the viewsets automatically reset its status to `pending`:
  ```python
  if instance.status == 'approved':
      update_kwargs = {'status': 'pending', 'approved_by': None, 'approved_at': None}
  updated_obj = serializer.save(**update_kwargs)
  ```
  The post-save signal in `signals.py` checks status changes:
  ```python
  old_status = getattr(instance, '_old_status', None)
  if old_status and old_status != instance.status:
      own.LeaveUpdatedNotification().dispatch({'instance': instance})
  ```
  Because `old_status` was `'approved'` and `instance.status` is now `'pending'`, the system dispatches `own_leave_updated`.
  Even if the user had disabled `own_leave_submitted` and `own_leave_edited`, this notification fires because it is categorized under `own_leave_updated`.
- **Impact**:
  The user is confused because they submitted an edit, disabled submission notices, and yet got a warning saying their own record was updated to pending.

---

### Finding F2 (HIGH): Approver is Never Notified When an Approved Record is Edited / Re-submitted
- **Files**:
  - `plugins/notifications/signals.py:163-168`
  - `plugins/notifications/signals.py:226-231`
  - `plugins/notifications/signals.py:264-269`
- **Symptom**:
  When a team member modifies an already-approved record (moving it back into `pending`), the Team Leader receives zero notifications.
- **Root Cause**:
  In `signals.py`, `TeamActionRequiredNotification` is guarded strictly by `if created:`:
  ```python
  if created:
      own.LeaveSubmittedNotification().dispatch({'instance': instance})
      team.TeamActionRequiredNotification().dispatch({
          'instance': instance,
          'entity_type': 'leave',
      })
  ```
  On an edit of an approved record, `created` is `False`. The signal handler assumes only brand-new rows need team action.
- **Impact**:
  Approvers are never alerted that an approved item was re-opened and requires re-approval. The request can sit unnoticed in the queue indefinitely.

---

### Finding F3 (HIGH): Overtime and Standby Logs Have No Edit Notification Support
- **Files**:
  - `plugins/notifications/signals.py:219-274`
  - `plugins/notifications/types/own.py`
- **Symptom**:
  When an employee modifies a pending Overtime Log (e.g. changes hours from 2 to 8, or shifts the work date) or a Standby Log, no notification is ever dispatched.
- **Root Cause**:
  `LeaveRequest` tracks edits via `_old_values` and dispatches `own.LeaveEditedNotification`.
  `OvertimeLog` and `StandbyLog` track only `_old_status`. They have no `_old_values` tracking in `pre_save`, and there are no `OvertimeEditedNotification` or `StandbyEditedNotification` classes in `plugins/notifications/types/own.py`.
- **Impact**:
  Inconsistent behavior across modules. Employees receive edit confirmations for Leave, but complete silence for Overtime and Standby edits.

---

### Finding F4 (HIGH): Overtime and Standby Deletions Silently Vanish Without Notifying Approvers
- **Files**:
  - `plugins/notifications/signals.py:195-198`
  - `plugins/notifications/signals.py:276-312`
- **Symptom**:
  When a team member deletes a pending Leave Request, the Team Leader receives a `TeamLeaveDeletedNotification` explaining why it disappeared from the queue.
  When a team member deletes an Overtime or Standby log, no notification is dispatched.
- **Root Cause**:
  In `signals.py`, only `LeaveRequest` has a `post_delete` signal connected:
  ```python
  @receiver(post_delete, sender=LeaveRequest, dispatch_uid='notifications.leave_request_deleted')
  def leave_request_deleted(sender, instance, **kwargs):
      team.TeamLeaveDeletedNotification().dispatch({'instance': instance})
  ```
  Neither `OvertimeLog` nor `StandbyLog` has a `post_delete` signal receiver or notification class.
- **Impact**:
  Approvers who saw a pending overtime or standby entry find that it vanishes with no audit trail or notification.

---

### Finding F5 (HIGH): Type Mismatch (Date vs String) Causes Spurious Edit Notifications on Creation
- **Files**:
  - `plugins/notifications/signals.py:137-141`
  - `plugins/notifications/signals.py:177-188`
- **Symptom**:
  In multi-step creation flows (e.g., `LeaveRequest.save()` internal second save with `update_fields=['submitted_at']`, or programmatic creation), a spurious "Leave Request Edited" notification is sometimes generated immediately on submission.
- **Root Cause**:
  In `track_leave_request_state`:
  ```python
  old = LeaveRequest.objects.get(pk=instance.pk)
  instance._old_values = {
      'start_date': old.start_date, # datetime.date object
      'end_date': old.end_date,
      ...
  }
  ```
  If `instance.start_date` was set as a string (e.g., `'2026-11-10'`), Python evaluates `datetime.date(2026, 11, 10) != '2026-11-10'` as `True`.
  When a follow-up save occurs, `changed_fields` detects a change and dispatches `own.LeaveEditedNotification`.
- **Impact**:
  A user submits a brand-new leave request and immediately gets a notification saying their request was edited.

---

### Finding F6 (MEDIUM): Globally Disabled Types Vanish Silently From User Settings
- **Files**:
  - `plugins/notifications/viewsets.py:125-128`
  - `frontend/src/pages/settings/components/NotificationPreferencesSection.tsx`
- **Symptom**:
  When an admin toggles off an event type in the Admin Settings page (e.g., `own_leave_submitted` or `own_leave_edited`), those toggles disappear completely from the user's Settings page.
- **Root Cause**:
  `NotificationViewSet._available_preference_pairs` filters out disabled types:
  ```python
  disabled = NotificationEventTypeConfig.disabled_event_types()
  for event_type in event_types:
      if event_type in disabled:
          continue
  ```
  Instead of presenting the row as locked ("Disabled by organization"), the endpoint omits it.
- **Impact**:
  Users cannot tell if a notification is turned off for them or if the feature is broken/missing. When related notifications still fire (due to F1), users cannot inspect their settings to see why.

---

### Finding F7 (MEDIUM): Notification Bell Drawer Event Bubbling Bug
- **Files**:
  - `frontend/src/plugins/notifications/components/NotificationBell.tsx:115-123`
- **Symptom**:
  Clicking "Mark read" on a notification inside the notification bell popover unexpectedly navigates the user to the notification link.
- **Root Cause**:
  In `NotificationBell.tsx`:
  ```tsx
  <Button
    variant="ghost"
    size="sm"
    onClick={() => handleMarkRead(notification.id)}
  >
    <Check className="mr-1 h-3 w-3" /> Mark read
  </Button>
  ```
  The click event bubbles up to the parent `div` which has:
  ```tsx
  <div onClick={() => handleNotificationClick(notification)}>
  ```
  Notice that `NotificationItem.tsx` correctly has `e.stopPropagation()`, but `NotificationBell.tsx` forgot it.
- **Impact**:
  Frustrating UX: trying to clear an unread badge on a dashboard page causes the page to navigate away.

---

### Finding F8 (LOW): Copy Discrepancy ("Off by default" vs Database Schema)
- **Files**:
  - `plugins/notifications/types/own.py:14-16`
  - `plugins/notifications/models.py:170-171`
- **Symptom**:
  The description for `LeaveSubmittedNotification`, `OvertimeSubmittedNotification`, and `StandbySubmittedNotification` reads:
  > *"Off by default: you know you submitted it, and your TL/HR are notified separately."*
  However, in `NotificationPreference`:
  ```python
  in_app_enabled = models.BooleanField(default=True)
  ```
  And `_preference_enabled` returns `True` for in-app when no row exists.
- **Impact**:
  Minor developer/admin confusion regarding intended defaults.

---

## 4. Complete Matrix of Notification Types & Roles

| Event Type Key | Category | Configurable | Default In-App | Default Push | Recipient Audience | Triggering Action |
|---|---|---|---|---|---|---|
| `own_leave_submitted` | own | Yes | Yes (Copy: Off) | Yes | Author | New LeaveRequest created |
| `own_leave_updated` | own | Yes | Yes | Yes | Author | Leave status changed (Approve/Reject/Pending) |
| `own_leave_edited` | own | Yes | Yes | Yes | Author | Leave dates/type edited while pending |
| `own_overtime_submitted` | own | Yes | Yes (Copy: Off) | Yes | Author | New OvertimeLog created |
| `own_overtime_updated` | own | Yes | Yes | Yes | Author | Overtime status changed |
| `own_standby_submitted` | own | Yes | Yes (Copy: Off) | Yes | Author | New StandbyLog created |
| `own_standby_updated` | own | Yes | Yes | Yes | Author | Standby status changed |
| `team_period_finalized` | own | Yes | Yes | Yes | Team Members | TL finalizes monthly approval period |
| `team_action_required` | team | Yes | Yes | Yes | Team Leaders | Member submits leave, overtime, or standby |
| `team_leave_deleted` | team | Yes | Yes | Yes | Team Leaders | Member deletes a leave request |
| `scorecard_record_shared` | own | **No (Always-on)** | Yes | No | Counterparty | 1-on-1 meeting summary shared |
| `scorecard_pip_started` | own | **No (Always-on)** | Yes | No | Employee | PIP plan approved & started |
| `scorecard_epr_stage_shared` | own | **No (Always-on)** | Yes | No | Employee | EPR review stage summary shared |
| `scorecard_pip_decided` | team | Yes | Yes | No | Team Leader | HR approves or returns draft PIP |
| `scorecard_promotion_decided` | team | Yes | Yes | No | Team Leader | HR decides promotion nomination |
| `hbpr_meetings` (group) | oversight | Yes | Yes | No | Assigned HBPR | TL partnership meetings & cadence |
| `hbpr_epr` (group) | oversight | Yes | Yes | No | Assigned HBPR | Member EPR stages & participation |
| `hbpr_pip_promotion` (group) | oversight | Yes | Yes | No | Assigned HBPR | PIP awaiting approval, closed, nominations |
| `hbpr_team_risks` (group) | oversight | Yes | Yes | No | Assigned HBPR | Idle time or unexplained absence flags |
| `hbpr_record_updates` (group) | oversight | Yes | Yes | No | Assigned HBPR | Management review deliveries, meetings |

---

## 5. Round 2 Re-Check Scorecard (Commit `bcfdd39`)

**Branch**: `fix/notifications-audit`  
**Commit**: `bcfdd39785d3de26e8b4af94aa17d8a6d5cf1322`  
**Tests Executed**:
- Backend notifications suite: **120 tests passed** (up from 112 baseline).
- Cross-app regression suite (`notifications`, `leave_management`, `overtime`, `standby`): **491 tests passed**.
- Frontend notifications Vitest: **23 tests passed**.
- TypeScript (`npx tsc -b`) & Linters (`ruff`, `eslint`): **All clean (0 errors)**.

### Findings Resolution Matrix

| Finding | Original Severity | Status in Round 2 | Resolution Details |
|---|---|---|---|
| **F1**: Spurious warning to author on decided record edit | **CRITICAL** | **RESOLVED** (`bcfdd39`) | `_dispatch_status_change` in `signals.py` suppresses `own_*_updated` when status transitions to `pending` on an owner edit. |
| **F2**: Approver not notified on resubmission | **HIGH** | **RESOLVED** (`bcfdd39`) | `_dispatch_status_change` dispatches `TeamActionRequiredNotification` with `resubmitted=True`, notifying the leader with title *"Action Required: {Type} Resubmitted"*. |
| **F4**: Overtime & Standby deletions vanish silently | **HIGH** | **RESOLVED** (`bcfdd39`) | Added `TeamOvertimeDeletedNotification` and `TeamStandbyDeletedNotification` connected via `post_delete` signals on `OvertimeLog` and `StandbyLog`. Bulk deletes skip fan-out via `_skip_notifications`. |
| **F7**: NotificationBell "Mark read" navigates away | **MEDIUM** | **RESOLVED** (`bcfdd39`) | Added `e.stopPropagation()` to the "Mark read" button onClick in `NotificationBell.tsx`. |
| **F8**: "Off by default" copy discrepancy | **LOW** | **RESOLVED** (`bcfdd39`) | Updated descriptions in `own.py` to *"Optional: you know you submitted it..."*. |
| **F3**: Pending Overtime/Standby internal field edits | **HIGH** | Open / Backlog | Owner edits to already-decided records are now handled via F1/F2 resubmission. Edits to pending OT/Standby without status changes remain silent. |
| **F5**: Date vs string comparison type coercion | **HIGH** | Open / Backlog | Covered in tests by pre-coercing preference fixtures; core `signals.py:191` can add `parse_date` normalization if non-ORM string saves occur. |
| **F6**: Admin kill-switch hides rows from User Settings | **MEDIUM** | Open / Backlog | By design per `models.py:193` (globally disabled types disappear from preferences endpoint). |

---

## 6. Recommended Next Steps
