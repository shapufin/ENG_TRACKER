# Handover: CSP Allowlist for Apple APNs and Windows Push Services (2026-11-22)

Related: 
- `docs/handover/2026-11-22-ios-push-notification-gesture-and-pairing.md`
- `docs/handover/2026-11-21-webpush-urgency-and-ttl.md`
- `docs/handover/2026-11-19-phone-approval-login.md`
- `docs/workflow-invariants.md` item 90.

Target files:
- `frontend/docker/nginx.conf.template`

---

## 1. Problem Description

After fixing the iOS transient user-gesture timing in `PairedPhonesSection.tsx` so that `Notification.requestPermission()` was prompted and the user tapped **"Allow"**, phone pairing on iOS still saved the phone with `endpoint: ""` (`can_push: false`, displayed as *"QR code only"*).

When logging in from a PC, phone approval failed to deliver a push notification to the iPhone, showing:
> *"We could not reach your phone. Scan this code with its camera, then tap this number:"*

---

## 2. Root Cause Analysis

### Issue A: Content Security Policy (CSP) `connect-src` Blocking Web Push Subscription
When a user grants notification permission on iOS Safari / PWA, the service worker subscription call:
```typescript
reg.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: urlB64ToUint8Array(applicationServerKey),
})
```
contacts Apple's Push Notification service (APNs) Web Push endpoint directly from the browser:
- `https://web.push.apple.com`
- Subdomains matching `https://*.push.apple.com`

In `frontend/docker/nginx.conf.template`, the CSP headers were configured as:
```nginx
connect-src 'self' https://fcm.googleapis.com https://push.services.mozilla.com https://updates.push.services.mozilla.com ${ONLYOFFICE_ORIGIN};
```

While Google FCM (`fcm.googleapis.com`) and Mozilla (`push.services.mozilla.com`) were explicitly allowlisted, **Apple's push service was missing entirely**.

Consequently:
1. The browser evaluated `connect-src` when `reg.pushManager.subscribe(...)` tried to reach `web.push.apple.com`.
2. The browser threw a CSP `SecurityError` violation blocking the request.
3. In `frontend/src/hooks/usePushNotifications.ts`, `subscribe()` caught the error and returned `false`.
4. In `PairedPhonesSection.tsx`, `pushEndpoint` fell back to `""`.
5. The phone record was saved on the backend with an empty push endpoint.

Note: Windows Notification Service (`https://*.notify.windows.com`) used by Edge on Windows was also missing from `connect-src`.

### Issue B: Apple APNs Rejection of VAPID Subject (`BadJwtToken`)
Once CSP allowed the client to obtain the subscription endpoint (`https://web.push.apple.com/...`), backend attempts to send push notifications failed with:
```
WebPushException: Push failed: 403 Forbidden
Response body:{"reason":"BadJwtToken"}
```
Apple APNs strictly enforces RFC 8292 Section 2.1 on the VAPID JWT's `sub` claim. The default subject was:
`mailto:admin@engineering-tracker.local`

Apple APNs rejects `.local` domains as invalid contact URIs.

---

## 3. Solution

1. **Nginx CSP Allowlist (`frontend/docker/nginx.conf.template`):**
Updated both `Content-Security-Policy` and `Content-Security-Policy-Report-Only` directives:
```nginx
connect-src 'self' https://fcm.googleapis.com https://push.services.mozilla.com https://updates.push.services.mozilla.com https://web.push.apple.com https://*.push.apple.com https://*.notify.windows.com ${ONLYOFFICE_ORIGIN};
```

2. **VAPID Subject Resolution (`plugins/notifications/vapid_utils.py` and `push_service.py`):**
Added `get_vapid_subject()` to automatically derive a valid contact URI from `WEBAUTHN_RP_ID` (e.g. `mailto:admin@tracker2.integrit.org`) or `WEBAUTHN_ORIGINS` when `VAPID_SUBJECT` is unset or points to `.local`.

Apple APNs accepted the push notification with `201 Created` immediately.

---

## 4. Verification

1. **CSP Header Check:**
   ```bash
   curl -sI http://127.0.0.1:8020/manifest.json | grep -i "content-security-policy"
   ```
   Verified that `https://web.push.apple.com https://*.push.apple.com https://*.notify.windows.com` appear in the `connect-src` directive for both standard and Report-Only CSP headers.

2. **Database Cleaned for Re-Pairing:**
   Cleared previous paired phone record (`id: 13`) for `elencio.mukaj` using:
   ```bash
   docker exec engineering-tracker-backend-1 python manage.py shell -c '
   from django.contrib.auth import get_user_model
   from apps.users.services import phone_pairing
   User = get_user_model()
   u = User.objects.get(username="elencio.mukaj")
   phone_pairing.remove_all(u)
   '
   ```
