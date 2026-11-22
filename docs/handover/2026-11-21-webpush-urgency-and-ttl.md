# Handover: Web Push Urgency & TTL for Phone Approval (2026-11-21)

Related: `docs/handover/2026-11-19-phone-approval-login.md`, `docs/workflow-invariants.md` item 90, `apps/users/services/phone_approval.py`, `plugins/notifications/push_service.py`.

## Problem Statement

Users testing phone approval (`POST /api/auth/token/phone-request/`) on mobile devices (e.g. Android with Google FCM) observed that sign-in approval notifications did not pop up on their phones while the phone was asleep or in the background until they manually opened Chrome or the app.

### Root Cause
1. **Missing `Urgency: high` Header (RFC 8030 §5.3):**
   In `plugins/notifications/push_service.py`, `webpush(...)` sends the request without an `Urgency` header. Web push gateways (Google FCM, Apple APNs, Mozilla Autopush) default to `normal` or `low` priority. Under Android Doze mode and iOS power management, normal/low priority messages are batched and deferred until maintenance windows or until the user manually wakes the device and launches the browser.
2. **Missing `ttl` Parameter (RFC 8030 §5.2):**
   In `pywebpush`, `ttl` defaults to `0`. A Time-To-Live of `0` instructs the push service to attempt immediate delivery only if an active connection exists right that second; otherwise, the gateway may drop or deprioritize it. For phone sign-in approvals, the request is valid for `PHONE_REQUEST_TTL_SECONDS = 120` seconds, so `ttl=120` should be passed to allow the gateway to queue and deliver the alert immediately during the active window.

---

## Required Implementation

### 1. `plugins/notifications/push_service.py`
Update `send_push_notification` signature and `webpush` invocation:

```python
DEFAULT_PUSH_TTL_SECONDS = 300  # 5 minutes for general notifications

def send_push_notification(
    user,
    title,
    message,
    url=None,
    endpoints=None,
    ttl=DEFAULT_PUSH_TTL_SECONDS,
    urgency="high",
):
```

In the loop where `webpush(...)` is called:
```python
            extra_headers = {"Urgency": urgency}
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {
                        "p256dh": sub.p256dh_key,
                        "auth": sub.auth_key,
                    },
                },
                data=payload_json,
                vapid_private_key=private_key,
                vapid_claims={"sub": VAPID_SUBJECT},
                timeout=PUSH_TIMEOUT_SECONDS,
                ttl=ttl,
                headers=extra_headers,
            )
```

### 2. `apps/users/services/phone_approval.py`
In `_push_to_phones(user, approve_url)`:
Pass `ttl=PHONE_REQUEST_TTL_SECONDS` (120 s) and `urgency='high'`:

```python
        sent, _failed = send_push_notification(
            user,
            'Approve this sign-in?',
            'Open to approve with your fingerprint or face. Only if you are signing in now.',
            url=approve_url,
            endpoints=endpoints,
            ttl=PHONE_REQUEST_TTL_SECONDS,
            urgency='high',
        )
```

---

## Testing & Verification Checklist

1. **Unit tests in `plugins/notifications/`:**
   - Review `plugins/notifications/test_push_resilience.py`.
   - Update `test_every_send_carries_a_bounded_timeout`: note that this test inspects `mock_webpush.call_args.kwargs['timeout']`. Add checks for:
     ```python
     self.assertEqual(mock_webpush.call_args.kwargs['timeout'], PUSH_TIMEOUT_SECONDS)
     self.assertEqual(mock_webpush.call_args.kwargs['ttl'], DEFAULT_PUSH_TTL_SECONDS)
     self.assertEqual(mock_webpush.call_args.kwargs['headers'], {'Urgency': 'high'})
     ```
   - Add a test verifying custom `ttl` and `urgency` parameters passed into `send_push_notification` are forwarded to `webpush`.
2. **Unit tests in `apps/users/tests_app/`:**
   - `test_phone_approval_service.py` and `test_phone_approval_auth.py` mock `send_push_notification`. Verify mock calls match or accept the new arguments.
3. **Run backend verification:**
   ```bash
   py -3.14 manage.py test plugins.notifications apps.users
   ```
4. **Deploy & Container restart:**
   - Rebuild or restart `engineering-tracker-backend-1`:
     ```bash
     docker restart engineering-tracker-backend-1
     ```

---

## Device-Side Guidance for Users

Even with `Urgency: high`, aggressive device battery management (e.g. Samsung One UI "Sleeping apps", Xiaomi MIUI background restrictions) can restrict background network activity for browsers. Users should be advised:
- Android: App Info for Chrome / PWA -> Battery -> set to **Unrestricted**; Mobile Data -> **Allow background data usage** ON.
- iOS: App must be added to Home Screen (PWA standalone mode) per `PushSetupGuide.tsx`.
