import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/GlassCard";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  TABLE_BODY_CELL_CLASS,
  TABLE_HEAD_CELL_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_ROW_HOVER_CLASS,
} from "@/components/ui/tableStyles";
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
 * Per-category notification toggles as a Category × Channel matrix (the
 * converged web pattern for multi-channel preference centers): one row per
 * category, one column per channel. Channel descriptions live in the column
 * headers, stated once instead of repeated on every row. An HBPR sees their
 * five governance groups under their own section; other roles see their
 * existing categories.
 */
export const NotificationPreferencesSection: React.FC = () => {
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [updatingKeys, setUpdatingKeys] = useState<Set<string>>(new Set());
  // Saves in flight. A focus refetch replaces the whole list, so it must wait
  // for these or it would overwrite an optimistic value with the server's old one.
  const savesInFlight = useRef(0);

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

  // Settings stays open while an admin changes a type's kill-switch in another
  // tab; refetching on focus makes the rows here match on return.
  useEffect(() => {
    void load();
    const onFocus = () => {
      if (savesInFlight.current === 0) void load();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const retry = () => {
    setIsLoading(true);
    void load();
  };

  const update = async (eventType: string, channel: Channel, value: boolean) => {
    const previous = preferences.find((item) => item.event_type === eventType)?.[channel] ?? false;
    savesInFlight.current += 1;
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
      savesInFlight.current -= 1;
      setUpdatingKeys((prev) => {
        const next = new Set(prev);
        next.delete(eventType);
        return next;
      });
    }
  };

  const renderChannelHeader = (channel: string) => (
    <th scope="col" className={cn(TABLE_HEAD_CELL_CLASS, "px-2 text-center sm:px-4")}>
      {channel}
    </th>
  );

  const renderRow = (preference: NotificationPreference) => {
    const disabled = updatingKeys.has(preference.event_type);
    // Narrower side padding below sm so the matrix fits 375px viewports
    // without horizontal scrolling; the shared constants still own the
    // padding at sm and up (prefixed/unprefixed are separate merge groups).
    const bodyCell = cn(TABLE_BODY_CELL_CLASS, "px-2 sm:px-4");
    const channelCell = (channel: Channel, label: string) => (
      <td className={cn(bodyCell, "text-center")}>
        <div className="flex justify-center">
          <Switch
            id={`${preference.event_type}-${channel === "in_app_enabled" ? "in-app" : "push"}`}
            checked={preference[channel]}
            disabled={disabled}
            onCheckedChange={(value) => update(preference.event_type, channel, value)}
            aria-label={`${preference.label}: ${label}`}
          />
        </div>
      </td>
    );
    return (
      <tr key={preference.event_type} className={TABLE_ROW_HOVER_CLASS}>
        <td className={cn(bodyCell, "text-sm font-medium")}>{preference.label}</td>
        {channelCell("in_app_enabled", "in-app notifications")}
        {channelCell("push_enabled", "push notifications")}
      </tr>
    );
  };

  const renderSection = (title: string | null, rows: NotificationPreference[]) => {
    if (rows.length === 0) return null;
    return (
      <React.Fragment key={title ?? "main"}>
        {title && (
          <tr>
            <td
              colSpan={3}
              className="bg-muted/30 text-muted-foreground px-4 py-1.5 text-xs font-semibold tracking-wide uppercase"
            >
              {title}
            </td>
          </tr>
        )}
        {rows.map(renderRow)}
      </React.Fragment>
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
          your role. <span className="text-foreground font-medium">In-app</span> notifications
          appear in the notification centre;{" "}
          <span className="text-foreground font-medium">Push</span> notifications go to your
          subscribed devices.
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
          <div className="border-border/70 overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className={TABLE_HEAD_ROW_CLASS}>
                <tr>
                  <th scope="col" className={cn(TABLE_HEAD_CELL_CLASS, "px-2 sm:px-4")}>
                    Category
                  </th>
                  {renderChannelHeader("In-app")}
                  {renderChannelHeader("Push")}
                </tr>
              </thead>
              <tbody className="divide-border/40 divide-y">
                {renderSection(hbprRows.length > 0 ? "HBPR Governance" : null, hbprRows)}
                {renderSection(hbprRows.length > 0 ? "Other notifications" : null, otherRows)}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </GlassCard>
  );
};
