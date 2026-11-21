import React from "react";
import {
  BatteryCharging,
  Bell,
  Globe,
  Settings,
  Share2,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Platform = "ios" | "android";

const detectPlatform = (): Platform =>
  typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent)
    ? "ios"
    : "android";

type Step = { icon: LucideIcon; text: React.ReactNode };

const StepList = ({ steps }: { steps: Step[] }) => (
  <ol className="space-y-2">
    {steps.map(({ icon: Icon, text }, index) => (
      <li key={index} className="bg-muted/40 flex items-start gap-3 rounded-lg border p-3">
        <span className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-xs">
          {index + 1}
        </span>
        <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p className="text-sm">{text}</p>
      </li>
    ))}
  </ol>
);

const IOS_STEPS: Step[] = [
  {
    icon: Globe,
    text: (
      <>
        Needs iOS 16.4 or later. Open this site in <strong>Safari</strong> on your iPhone.
      </>
    ),
  },
  {
    icon: Share2,
    text: (
      <>
        Tap the <strong>Share</strong> button, then <strong>Add to Home Screen</strong>.
      </>
    ),
  },
  {
    icon: Smartphone,
    text: "Close Safari and open Engineering Tracker from the new Home Screen icon.",
  },
  {
    icon: Settings,
    text: (
      <>
        Sign in, go to <strong>Settings</strong>, <strong>Security</strong>, then{" "}
        <strong>Set up this phone</strong>.
      </>
    ),
  },
  {
    icon: Bell,
    text: (
      <>
        Tap <strong>Allow</strong> when asked about notifications. iPhone only shows that question
        from the Home Screen app, not from Safari.
      </>
    ),
  },
];

const ANDROID_STEPS: Step[] = [
  {
    icon: Globe,
    text: (
      <>
        Open this site in <strong>Chrome</strong> on your Android phone and sign in.
      </>
    ),
  },
  {
    icon: Settings,
    text: (
      <>
        Go to <strong>Settings</strong>, <strong>Security</strong>, then{" "}
        <strong>Set up this phone</strong>.
      </>
    ),
  },
  {
    icon: Bell,
    text: (
      <>
        Tap <strong>Allow</strong> when Chrome asks to send notifications.
      </>
    ),
  },
  {
    icon: Globe,
    text: (
      <>
        If you tapped Block before: tap the lock icon next to the address, open{" "}
        <strong>Permissions</strong>, set <strong>Notifications</strong> to Allow, then set the
        phone up again.
      </>
    ),
  },
  {
    icon: Smartphone,
    text: "Also check that notifications for Chrome are on in the phone's own settings.",
  },
  {
    icon: BatteryCharging,
    text: (
      <>
        If approvals arrive late, open Android <strong>Settings</strong>, <strong>Apps</strong>,{" "}
        <strong>Chrome</strong>, <strong>Battery</strong> and choose <strong>Unrestricted</strong>;
        under <strong>Mobile data</strong>, allow background data usage.
      </>
    ),
  },
];

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
        <StepList steps={IOS_STEPS} />
      </TabsContent>
      <TabsContent value="android" className="mt-3">
        <StepList steps={ANDROID_STEPS} />
      </TabsContent>
    </Tabs>
    <p className="text-muted-foreground text-xs">
      No notifications? Sign-in still works: the computer shows a QR code, scan it with the
      phone&apos;s camera.
    </p>
  </div>
);
