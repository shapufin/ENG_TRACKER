# Handover: iOS Web Push Notification Permission Timing in Phone Pairing (2026-11-22)

Related: `docs/handover/2026-11-21-webpush-urgency-and-ttl.md`, `docs/handover/2026-11-19-phone-approval-login.md`, `docs/workflow-invariants.md` item 90.  
Target files:
- `frontend/src/pages/settings/components/PairedPhonesSection.tsx`
- `frontend/src/pages/settings/components/PairedPhonesSection.test.tsx`

---

## 1. Problem Description

When users set up phone approval on an iPhone via the Home Screen web app (iOS PWA standalone mode), the phone is successfully registered with a Face ID/Touch ID passkey, but **the push endpoint is saved as empty (`endpoint: ""`)** and the device is categorized as **"QR code only"**. 

Consequently, when signing in from a PC, the PC reports:
> *"We could not reach your phone. Scan this code with its camera, then tap this number:"*

No push notification arrives on the iPhone.

---

## 2. Root Cause Analysis

### WebKit Transient Activation (User Gesture Token) Requirement
On iOS 16.4+, Apple supports Web Push for Home Screen web applications, but strictly enforces that:
> `Notification.requestPermission()` **must be invoked during the synchronous handling of a user gesture** (a direct button click or tap).

In `frontend/src/pages/settings/components/PairedPhonesSection.tsx` (lines 118–126), the mutation sequence is:

```typescript
// CURRENT (BROKEN ON IOS):
const passkey = await registerPasskey(password, name); // <--- Asynchronous: network roundtrip + WebAuthn dialog

let pushEndpoint = "";
if (push.pushAvailability === "available") {
  // <--- By this point, the initial user gesture token has EXPIRED.
  const allowed = push.permission === "granted" || (await push.requestPermission());
  if (allowed && (await push.subscribe())) pushEndpoint = await currentPushEndpoint();
}
await pairPhone({ password, code, credentialId: passkey.id, name, pushEndpoint });
```

Because `await registerPasskey()` performs multiple asynchronous calls (`api.post` -> `navigator.credentials.create` -> `api.post`), the browser's transient user activation window closes. When iOS WebKit subsequently executes `Notification.requestPermission()`, **it detects no active user gesture and silently suppresses the native permission prompt**, returning `"default"` or `"denied"` without prompting the user.

As a result:
1. `allowed` is `false`.
2. `push.subscribe()` is skipped.
3. `pushEndpoint` is `""`.
4. `pairPhone` saves the phone with `endpoint: ""` (`can_push: false`).

---

## 3. Required Code Changes

### File: `frontend/src/pages/settings/components/PairedPhonesSection.tsx`

Swap the order so `push.requestPermission()` and subscription happen **first**, directly upon form submission before any asynchronous WebAuthn ceremony:

```typescript
      // 1. Request notification permission immediately while the user gesture is active
      let pushEndpoint = "";
      if (push.pushAvailability === "available") {
        const allowed = push.permission === "granted" || (await push.requestPermission());
        if (allowed && (await push.subscribe())) {
          pushEndpoint = await currentPushEndpoint();
        }
      }

      // 2. Perform WebAuthn passkey registration (Face ID / Touch ID)
      const passkey = await registerPasskey(password, name);

      // 3. Pair phone with credential and the captured push endpoint
      await pairPhone({ password, code, credentialId: passkey.id, name, pushEndpoint });
      if (!pushEndpoint) {
        toast.message(
          "Phone set up without notifications. Sign-ins will show a QR code to scan with its camera."
        );
      }
```

---

## 4. Test Updates

### File: `frontend/src/pages/settings/components/PairedPhonesSection.test.tsx`

Update the test expectations to verify that `requestPermission` / `subscribe` are called before or alongside `registerPasskey`:

```typescript
  it("creates a passkey on this phone, asks for notifications and pairs it", async () => {
    vi.mocked(mfaService.status).mockResolvedValue(status({ phones: [] }));
    vi.mocked(registerPasskey).mockResolvedValue({
      id: 33,
      name: "This phone",
      created_at: "x",
      last_used_at: null,
    });
    vi.mocked(currentPushEndpoint).mockResolvedValue("https://fcm.googleapis.com/fcm/send/abc");
    vi.mocked(pairPhone).mockResolvedValue(phone);
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Set up this phone" }));
    await fillAndSubmit("Set up phone");

    await waitFor(() =>
      expect(pairPhone).toHaveBeenCalledWith({
        password: "pw",
        code: "",
        credentialId: 33,
        name: "This phone",
        pushEndpoint: "https://fcm.googleapis.com/fcm/send/abc",
      })
    );
    expect(push.state.requestPermission).toHaveBeenCalled();
    expect(registerPasskey).toHaveBeenCalledWith("pw", "This phone");
    expect(toast.success).toHaveBeenCalled();
  });
```

---

## 5. Verification Steps on Local / Dev

1. **Run Frontend Tests & Typecheck:**
   ```bash
   cd frontend
   npm run test -- PairedPhonesSection.test.tsx
   npm run lint
   npm run build
   ```

2. **Testing on iPhone Device:**
   1. Open the Home Screen PWA (EngTracker icon).
   2. Navigate to **Settings** → **Security** → **Phone approval**.
   3. Tap **Remove** on any existing phone.
   4. Tap **Set up this phone**.
   5. Observe the native iOS prompt:  
      **"EngTracker Would Like to Send You Notifications"** -> Tap **Allow**.
   6. Confirm Face ID / Passkey creation.
   7. Verify that the device is now listed with **"Notifications on"** (not "QR code only").
   8. In the database / API, check that `PairedPhone.push_endpoint` starts with `https://web.push.apple.com/`.
   9. Sign in from PC and verify the push alert appears immediately on the iPhone lockscreen/banner.

3. **iOS Settings Troubleshooting:**
   If a user previously tapped "Don't Allow" on iOS, the prompt will not show again until re-enabled in system settings:
   - Go to iPhone **Settings** → **EngTracker** (or **Notifications**) → toggle **Allow Notifications** to **ON**.
