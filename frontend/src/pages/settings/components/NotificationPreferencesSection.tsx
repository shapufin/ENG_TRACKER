import React, { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/GlassCard";
import { SwitchField } from "@/components/common/forms/SwitchField";
import { notificationService, type NotificationPreference } from "@/plugins/notifications/service";
import { usePushNotifications } from "@/hooks/usePushNotifications";

export const NotificationPreferencesSection: React.FC = () => {
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const {
    isSupported,
    isSubscribed,
    isSubscribing,
    error,
    permission,
    pushAvailability,
    subscribe,
  } = usePushNotifications();
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    notificationService
      .getPreferences()
      .then(setPreferences)
      .catch(() => toast.error("Could not load notification preferences"))
      .finally(() => setIsLoading(false));
  }, []);

  const update = async (
    preference: NotificationPreference,
    channel: "in_app_enabled" | "push_enabled",
    value: boolean
  ) => {
    if (channel === "push_enabled" && value && (!isSupported || !isSubscribed)) {
      if (pushAvailability === "installed-required") {
        toast.error("Install the app first to enable push notifications");
        return;
      }
      const subscribed = await subscribe();
      if (!subscribed) {
        toast.error("Push notifications could not be enabled on this device");
        return;
      }
    }

    const key = `${preference.event_type}:${channel}`;
    const previous = preferences;
    setUpdating(key);
    setPreferences((current) =>
      current.map((item) =>
        item.event_type === preference.event_type ? { ...item, [channel]: value } : item
      )
    );

    try {
      const saved = await notificationService.updatePreference(preference.event_type, {
        in_app_enabled: channel === "in_app_enabled" ? value : preference.in_app_enabled,
        push_enabled: channel === "push_enabled" ? value : preference.push_enabled,
      });
      setPreferences((current) =>
        current.map((item) => (item.event_type === saved.event_type ? saved : item))
      );
    } catch {
      setPreferences(previous);
      toast.error("Could not save notification preference");
    } finally {
      setUpdating(null);
    }
  };

  return (
    <GlassCard delay={0.08}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notification Preferences
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Choose which notifications you receive. Available options depend on your role.
        </p>
        {!isSupported && (
          <p className="text-sm text-muted-foreground">
            Push notifications are not supported on this device. In-app notifications remain
            available.
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
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading preferences…</p>
        ) : preferences.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notification preferences available.</p>
        ) : (
          <div className="space-y-3">
            {preferences.map((preference) => (
              <div
                key={preference.event_type}
                className="flex flex-col gap-3 rounded-lg border border-border/70 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm font-medium">{preference.label}</span>
                <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
                  <SwitchField
                    id={`${preference.event_type}-in-app`}
                    label="In-app"
                    description="Show in the notification center."
                    checked={preference.in_app_enabled}
                    disabled={updating === `${preference.event_type}:in_app_enabled`}
                    onCheckedChange={(value) => update(preference, "in_app_enabled", value)}
                    ariaLabel={`${preference.label}: in-app notifications`}
                  />
                  <SwitchField
                    id={`${preference.event_type}-push`}
                    label="Push"
                    description="Send to this device."
                    checked={preference.push_enabled}
                    disabled={updating === `${preference.event_type}:push_enabled` || isSubscribing}
                    onCheckedChange={(value) => update(preference, "push_enabled", value)}
                    ariaLabel={`${preference.label}: push notifications`}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </GlassCard>
  );
};
