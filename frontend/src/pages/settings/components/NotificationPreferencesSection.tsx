import React, { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/GlassCard";
import { SwitchField } from "@/components/common/forms/SwitchField";
import { notificationService, type NotificationPreference } from "@/plugins/notifications/service";

/**
 * Every HBPR preference group key shares this prefix (see the notifications
 * registry's `preference_group` values). The backend already returns group keys
 * rather than raw event types for an HBPR, so grouping here is presentation.
 */
const HBPR_GROUP_PREFIX = "hbpr_";
const isHbprGroup = (key: string) => key.startsWith(HBPR_GROUP_PREFIX);

type Channel = "in_app_enabled" | "push_enabled";

/**
 * Per-category notification toggles, one row per preference key. An HBPR sees
 * their five governance groups under their own heading, each with independent
 * in-app and push switches; other roles see their existing categories.
 */
export const NotificationPreferencesSection: React.FC = () => {
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [updatingKeys, setUpdatingKeys] = useState<Set<string>>(new Set());

  // State is only ever set from the promise callbacks, never synchronously in
  // the effect body, so mounting cannot trigger a cascading render.
  const load = useCallback(
    () =>
      notificationService
        .getPreferences()
        .then((rows) => {
          setPreferences(rows);
          setLoadError(false);
        })
        .catch(() => setLoadError(true))
        .finally(() => setIsLoading(false)),
    []
  );

  useEffect(() => {
    void load();
  }, [load]);

  const retry = () => {
    setIsLoading(true);
    void load();
  };

  const update = async (eventType: string, channel: Channel, value: boolean) => {
    const previous = preferences.find((item) => item.event_type === eventType)?.[channel] ?? false;
    setUpdatingKeys((prev) => new Set(prev).add(eventType));
    setPreferences((current) =>
      current.map((item) => (item.event_type === eventType ? { ...item, [channel]: value } : item))
    );

    try {
      // The response is the user's full preference list, but only THIS row is
      // taken from it: replacing the whole list would clobber another row's
      // still-in-flight optimistic toggle with a stale value.
      const saved = await notificationService.updatePreference(eventType, { [channel]: value });
      const row = saved.find((item) => item.event_type === eventType);
      setPreferences((current) =>
        current.map((item) => (item.event_type === eventType && row ? row : item))
      );
    } catch {
      setPreferences((current) =>
        current.map((item) =>
          item.event_type === eventType ? { ...item, [channel]: previous } : item
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

  const renderRow = (preference: NotificationPreference) => {
    const disabled = updatingKeys.has(preference.event_type);
    return (
      <div key={preference.event_type} className="border-border/70 rounded-lg border p-3">
        <p className="text-sm font-medium">{preference.label}</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <SwitchField
            id={`${preference.event_type}-in-app`}
            label="In-app"
            description="Show in the notification centre."
            checked={preference.in_app_enabled}
            disabled={disabled}
            onCheckedChange={(value) => update(preference.event_type, "in_app_enabled", value)}
            ariaLabel={`${preference.label}: in-app notifications`}
            className="border-border/40"
          />
          <SwitchField
            id={`${preference.event_type}-push`}
            label="Push"
            description="Send to your subscribed devices."
            checked={preference.push_enabled}
            disabled={disabled}
            onCheckedChange={(value) => update(preference.event_type, "push_enabled", value)}
            ariaLabel={`${preference.label}: push notifications`}
            className="border-border/40"
          />
        </div>
      </div>
    );
  };

  const hbprRows = preferences.filter((preference) => isHbprGroup(preference.event_type));
  const otherRows = preferences.filter((preference) => !isHbprGroup(preference.event_type));

  return (
    <GlassCard delay={0.1}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" aria-hidden="true" />
          Notification Preferences
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Choose which notifications you receive and how they reach you. Available options depend on
          your role.
        </p>

        {isLoading ? (
          <div aria-busy="true" className="space-y-3">
            <span className="sr-only">Loading notification preferences…</span>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-muted/40 h-20 animate-pulse rounded-lg border" />
            ))}
          </div>
        ) : loadError ? (
          <div className="space-y-2">
            <p role="alert" className="text-tone-danger-text text-sm">
              Could not load notification preferences.
            </p>
            <Button variant="outline" size="sm" onClick={retry}>
              Retry
            </Button>
          </div>
        ) : preferences.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No notification preferences are available for your role.
          </p>
        ) : (
          <>
            {hbprRows.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  HBPR Governance
                </h3>
                {hbprRows.map(renderRow)}
              </div>
            )}
            {otherRows.length > 0 && (
              <div className="space-y-3">
                {hbprRows.length > 0 && (
                  <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                    Other notifications
                  </h3>
                )}
                {otherRows.map(renderRow)}
              </div>
            )}
          </>
        )}
      </CardContent>
    </GlassCard>
  );
};
