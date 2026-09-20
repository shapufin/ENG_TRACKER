import React, { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/GlassCard";
import { SwitchField } from "@/components/common/forms/SwitchField";
import { notificationService, type NotificationPreference } from "@/plugins/notifications/service";

interface NotificationPreferencesSectionProps {
  /** Read from the single `usePushNotifications()` call in `SettingsPage`
   * (shared with `PushNotificationSection` above) instead of running a
   * second service-worker-ready check on every page load. */
  isSubscribed: boolean;
  isSubscribing: boolean;
}

/** Per-event-type in-app/push preference grid. Device-level push
 * subscription (browser permission + service worker) is owned by
 * `PushNotificationSection` above this card — enabling a category's push
 * channel here only flips the per-user preference row; the push switch is
 * disabled (not just blocked on click) until the device itself is
 * subscribed there. */
export const NotificationPreferencesSection: React.FC<NotificationPreferencesSectionProps> = ({
  isSubscribed,
  isSubscribing,
}) => {
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingKeys, setUpdatingKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    notificationService
      .getPreferences()
      .then(setPreferences)
      .catch(() => toast.error("Could not load notification preferences"))
      .finally(() => setIsLoading(false));
  }, []);

  const update = async (
    eventType: string,
    channel: "in_app_enabled" | "push_enabled",
    value: boolean,
    previousValue: boolean
  ) => {
    const key = `${eventType}:${channel}`;
    setUpdatingKeys((prev) => new Set(prev).add(key));
    setPreferences((current) =>
      current.map((item) => (item.event_type === eventType ? { ...item, [channel]: value } : item))
    );

    try {
      // The response is the user's full, current preference list (server
      // truth after this change) — use it directly rather than merging by
      // event_type into a partial/singular shape.
      const saved = await notificationService.updatePreference(eventType, { [channel]: value });
      setPreferences(saved);
    } catch {
      setPreferences((current) =>
        current.map((item) =>
          item.event_type === eventType ? { ...item, [channel]: previousValue } : item
        )
      );
      toast.error("Could not save notification preference");
    } finally {
      setUpdatingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  return (
    <GlassCard delay={0.1}>
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
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading preferences…</p>
        ) : preferences.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notification preferences available.</p>
        ) : (
          <div className="space-y-3">
            {preferences.map((preference) => {
              const inAppKey = `${preference.event_type}:in_app_enabled`;
              const pushKey = `${preference.event_type}:push_enabled`;
              const pushDisabled = !isSubscribed || isSubscribing || updatingKeys.has(pushKey);
              return (
                <div
                  key={preference.event_type}
                  className="flex flex-col gap-3 rounded-lg border border-border/70 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <span className="text-sm font-medium">{preference.label}</span>
                    {!preference.globally_enabled && (
                      <p className="text-xs text-warning">
                        Disabled by admin — your setting won't take effect until re-enabled.
                      </p>
                    )}
                  </div>
                  <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
                    <SwitchField
                      id={`${preference.event_type}-in-app`}
                      label="In-app"
                      description="Show in the notification center."
                      checked={preference.in_app_enabled}
                      disabled={updatingKeys.has(inAppKey)}
                      onCheckedChange={(value) =>
                        update(preference.event_type, "in_app_enabled", value, preference.in_app_enabled)
                      }
                      ariaLabel={`${preference.label}: in-app notifications`}
                    />
                    <SwitchField
                      id={`${preference.event_type}-push`}
                      label="Push"
                      description={
                        isSubscribed
                          ? "Send to this device."
                          : "Enable “Push on this device” above first."
                      }
                      checked={preference.push_enabled}
                      disabled={pushDisabled}
                      onCheckedChange={(value) =>
                        update(preference.event_type, "push_enabled", value, preference.push_enabled)
                      }
                      ariaLabel={`${preference.label}: push notifications`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </GlassCard>
  );
};
