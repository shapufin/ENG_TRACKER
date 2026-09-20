import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { SwitchField } from "@/components/common/forms/SwitchField";

/** Local mirror of the notifications plugin's NotificationEventConfig shape,
 * so core never needs a type-only import of the plugin's own type (which
 * would still break `tsc` on `remove_plugin notifications`). */
interface NotificationEventConfig {
  event_type: string;
  label: string;
  description: string;
  is_enabled: boolean;
}

const loadEventConfigs = async (): Promise<NotificationEventConfig[]> => {
  const { notificationService } = await import("@/plugins/notifications/service");
  return notificationService.getEventConfigs();
};

const EventConfigRow: React.FC<{
  config: NotificationEventConfig;
  disabled: boolean;
  onToggle: (config: NotificationEventConfig, value: boolean) => void;
}> = ({ config, disabled, onToggle }) => (
  <div className="flex flex-col gap-3 rounded-lg border border-border/70 p-3 sm:flex-row sm:items-start sm:justify-between">
    <div className="sm:flex-1">
      <span className="text-sm font-medium">{config.label}</span>
      <p className="mt-0.5 text-xs text-muted-foreground">{config.description}</p>
    </div>
    <SwitchField
      id={`event-config-${config.event_type}`}
      label={config.is_enabled ? "Enabled" : "Disabled"}
      checked={config.is_enabled}
      disabled={disabled}
      onCheckedChange={(value) => onToggle(config, value)}
      ariaLabel={`${config.label} notifications`}
    />
  </div>
);

export const NotificationEventsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [updating, setUpdating] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "notification-event-configs"],
    queryFn: loadEventConfigs,
  });

  const toggle = async (config: NotificationEventConfig, value: boolean) => {
    const key = config.event_type;
    setUpdating(key);
    try {
      const { notificationService } = await import("@/plugins/notifications/service");
      await notificationService.updateEventConfig(config.event_type, value);
      queryClient.setQueryData<NotificationEventConfig[]>(
        ["admin", "notification-event-configs"],
        (current) =>
          current?.map((item) =>
            item.event_type === config.event_type ? { ...item, is_enabled: value } : item
          )
      );
      toast.success(`${config.label} ${value ? "enabled" : "disabled"}`);
    } catch {
      toast.error("Could not save notification event configuration");
    } finally {
      setUpdating(null);
    }
  };

  return (
    <PageShell
      title="Notification Events"
      subtitle="Globally enable or disable notification categories for every user."
    >
      <GlassCard delay={0} className="max-w-2xl p-6">
        <div className="mb-4 flex items-center gap-2">
          <Bell className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Event Types</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Disabled events are never delivered — no in-app notification and no push, for any user.
          Disabling a category does not delete existing notifications.
        </p>
        {isLoading && <LoadingCard rows={6} />}
        {isError && (
          <ErrorCard
            title="Failed to load notification event configuration"
            onRetry={() => refetch()}
          />
        )}
        {data && (
          <div className="space-y-3">
            {data.map((config) => (
              <EventConfigRow
                key={config.event_type}
                config={config}
                disabled={updating === config.event_type}
                onToggle={toggle}
              />
            ))}
          </div>
        )}
      </GlassCard>
    </PageShell>
  );
};
