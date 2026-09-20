import React, { useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/GlassCard";
import { SwitchField } from "@/components/common/forms/SwitchField";
import { usePushNotifications } from "@/hooks/usePushNotifications";

/** Single per-device push toggle. Which notification *events* exist is
 * controlled globally by admins (Django admin → Notification event type
 * configs); users only decide whether this device receives push. */
export const PushNotificationSection: React.FC = () => {
  const {
    isSupported,
    isSubscribed,
    isSubscribing,
    error,
    permission,
    pushAvailability,
    subscribe,
    unsubscribe,
  } = usePushNotifications();
  const [updating, setUpdating] = useState(false);

  const handleToggle = async (value: boolean) => {
    if (value && (!isSupported || !isSubscribed)) {
      if (pushAvailability === "installed-required") {
        toast.error("Install the app first to enable push notifications");
        return;
      }
      setUpdating(true);
      const subscribed = await subscribe();
      setUpdating(false);
      if (!subscribed) {
        // The hook sets a specific `error` (blocked permission, insecure
        // origin, missing service worker) which renders right below the
        // toggle — point the transient toast at it.
        toast.error(
          "Push notifications could not be enabled on this device — see the reason shown below the toggle."
        );
        return;
      }
      return;
    }
    if (!value && isSubscribed) {
      setUpdating(true);
      const unsubscribed = await unsubscribe();
      setUpdating(false);
      if (!unsubscribed) {
        toast.error("Push notifications could not be disabled on this device");
      }
    }
  };

  return (
    <GlassCard delay={0.08}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Push Notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isSupported && (
          <p className="text-sm text-muted-foreground">
            Push notifications are not supported on this device. In-app notifications remain
            available.
          </p>
        )}
        {typeof window !== "undefined" && !window.isSecureContext && (
          <p className="text-sm text-warning">
            Push notifications require a secure (HTTPS) connection or localhost.
          </p>
        )}
        {pushAvailability === "installed-required" && (
          <p className="text-sm text-muted-foreground">
            Push notifications require installing this app first. Use your browser's &ldquo;Add to
            Home Screen&rdquo; or &ldquo;Install&rdquo; option, then open the installed app to
            enable push. In-app notifications remain available in the browser.
          </p>
        )}
        {isSupported && permission === "denied" && (
          <p className="text-sm text-warning">
            Push notifications are blocked. Enable them in your browser settings to use push.
          </p>
        )}
        {isSupported && error && permission !== "denied" && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        <SwitchField
          id="push-notifications-device"
          label="Push on this device"
          description="Send notifications to this device."
          checked={isSubscribed}
          disabled={updating || isSubscribing}
          onCheckedChange={handleToggle}
          ariaLabel="Push notifications on this device"
        />
      </CardContent>
    </GlassCard>
  );
};
