import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Platform = "ios" | "android";

const detectPlatform = (): Platform =>
  typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent)
    ? "ios"
    : "android";

const Steps = ({ children }: { children: React.ReactNode }) => (
  <ol className="text-muted-foreground list-decimal space-y-1.5 pl-5 text-sm">{children}</ol>
);

/**
 * Per-platform steps for getting sign-in notifications on a phone (phone approval, item 90).
 * Notifications are optional: without them the sign-in screen shows a QR code to scan instead.
 */
export const PushSetupGuide: React.FC<{ defaultTab?: Platform }> = ({ defaultTab }) => (
  <div className="space-y-3 pt-2">
    <Tabs defaultValue={defaultTab ?? detectPlatform()}>
      <TabsList aria-label="Phone type">
        <TabsTrigger value="ios">iPhone</TabsTrigger>
        <TabsTrigger value="android">Android</TabsTrigger>
      </TabsList>
      <TabsContent value="ios" className="mt-3">
        <Steps>
          <li>
            Needs iOS 16.4 or later. Open this site in <strong>Safari</strong> on your iPhone.
          </li>
          <li>
            Tap the <strong>Share</strong> button, then <strong>Add to Home Screen</strong>.
          </li>
          <li>Close Safari and open Engineering Tracker from the new Home Screen icon.</li>
          <li>
            Sign in, go to <strong>Settings</strong>, <strong>Security</strong>, then{" "}
            <strong>Set up this phone</strong>.
          </li>
          <li>
            Tap <strong>Allow</strong> when asked about notifications. iPhone only shows that
            question from the Home Screen app, not from Safari.
          </li>
        </Steps>
      </TabsContent>
      <TabsContent value="android" className="mt-3">
        <Steps>
          <li>
            Open this site in <strong>Chrome</strong> on your Android phone and sign in.
          </li>
          <li>
            Go to <strong>Settings</strong>, <strong>Security</strong>, then{" "}
            <strong>Set up this phone</strong>.
          </li>
          <li>
            Tap <strong>Allow</strong> when Chrome asks to send notifications.
          </li>
          <li>
            If you tapped Block before: tap the lock icon next to the address, open{" "}
            <strong>Permissions</strong>, set <strong>Notifications</strong> to Allow, then set the
            phone up again.
          </li>
          <li>Also check that notifications for Chrome are on in the phone&apos;s own settings.</li>
        </Steps>
      </TabsContent>
    </Tabs>
    <p className="text-muted-foreground text-xs">
      No notifications? Sign-in still works: the computer shows a QR code, scan it with the
      phone&apos;s camera.
    </p>
  </div>
);
