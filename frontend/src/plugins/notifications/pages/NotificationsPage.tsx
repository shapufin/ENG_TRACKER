import React from "react";
import { Bell, Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchField } from "@/components/ui/SearchField";
import { PageShell } from "@/components/layout/PageShell";
import { useNotificationsPage } from "./hooks/useNotificationsPage";
import { NotificationItem } from "../components/NotificationItem";

export const NotificationsPage: React.FC = () => {
  const {
    notifications,
    isLoading,
    searchQuery,
    setSearchQuery,
    filteredNotifications,
    handleMarkRead,
    handleMarkAllRead,
  } = useNotificationsPage();

  return (
    <PageShell
      title="Notifications"
      subtitle="Stay updated with your latest activities and requests."
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={handleMarkAllRead}
          disabled={notifications.every((n) => n.is_read)}
        >
          <Check className="mr-2 h-4 w-4" /> Mark all read
        </Button>
      }
    >
      <GlassCard>
        <CardHeader className="pb-3">
          <SearchField
            placeholder="Search notifications..."
            aria-label="Search notifications"
            value={searchQuery}
            onChange={setSearchQuery}
          />
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {isLoading ? (
              <div className="flex h-40 items-center justify-center">
                <Clock className="text-muted-foreground h-8 w-8 animate-spin" />
              </div>
            ) : filteredNotifications.length === 0 ? (
              <EmptyState icon={Bell} title="No notifications found." className="p-6" />
            ) : (
              filteredNotifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkRead={handleMarkRead}
                />
              ))
            )}
          </div>
        </CardContent>
      </GlassCard>
    </PageShell>
  );
};
