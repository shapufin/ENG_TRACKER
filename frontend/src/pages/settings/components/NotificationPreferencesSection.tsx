import React, { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/GlassCard";
import { SwitchField } from "@/components/common/forms/SwitchField";
import { notificationService, type NotificationPreference } from "@/plugins/notifications/service";

/** Per-event-type in-app notification toggle. Push delivery has no
 * device-subscribe UI right now, so only the in-app channel is editable
 * here; `push_enabled` stays whatever it was last set to on the backend. */
export const NotificationPreferencesSection: React.FC = () => {
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

  const update = async (eventType: string, value: boolean, previousValue: boolean) => {
    setUpdatingKeys((prev) => new Set(prev).add(eventType));
    setPreferences((current) =>
      current.map((item) =>
        item.event_type === eventType ? { ...item, in_app_enabled: value } : item
      )
    );

    try {
      // The response is the user's full, current preference list (server
      // truth after this change) — use it directly rather than merging by
      // event_type into a partial/singular shape.
      const saved = await notificationService.updatePreference(eventType, {
        in_app_enabled: value,
      });
      setPreferences(saved);
    } catch {
      setPreferences((current) =>
        current.map((item) =>
          item.event_type === eventType ? { ...item, in_app_enabled: previousValue } : item
        )
      );
      toast.error("Could not save notification preference");
    } finally {
      setUpdatingKeys((prev) => {
        const next = new Set(prev);
        next.delete(eventType);
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
            {preferences.map((preference) => (
              <div
                key={preference.event_type}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3"
              >
                <span className="text-sm font-medium">{preference.label}</span>
                <SwitchField
                  id={`${preference.event_type}-in-app`}
                  label="In-app"
                  description="Show in the notification center."
                  checked={preference.in_app_enabled}
                  disabled={updatingKeys.has(preference.event_type)}
                  onCheckedChange={(value) =>
                    update(preference.event_type, value, preference.in_app_enabled)
                  }
                  ariaLabel={`${preference.label}: in-app notifications`}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </GlassCard>
  );
};
