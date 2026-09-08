import React from "react";
import { Bell, Check, Clock, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/input";
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-line-subtle pb-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Stay updated with your latest activities and requests.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={notifications.every((n) => n.is_read)}
          >
            <Check className="mr-2 h-4 w-4" /> Mark all read
          </Button>
        </div>
      </div>

      <GlassCard isHoverLift={false}>
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search notifications..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {isLoading ? (
              <div className="flex h-40 items-center justify-center">
                <Clock className="h-8 w-8 animate-spin text-muted-foreground" />
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
    </div>
  );
};
