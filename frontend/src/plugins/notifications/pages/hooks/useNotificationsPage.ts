import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { notificationService, type NotificationRecord } from "../../service";

export const useNotificationsPage = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await notificationService.getNotificationPage(1);
      setNotifications(data.results);
      setPage(1);
      setHasMore(data.hasMore);
    } catch {
      toast.error("Failed to fetch notifications");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNotifications();
  }, [fetchNotifications]);

  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    try {
      const data = await notificationService.getNotificationPage(page + 1);
      setNotifications((prev) => {
        const seen = new Set(prev.map((n) => n.id));
        return [...prev, ...data.results.filter((n) => !seen.has(n.id))];
      });
      setPage(page + 1);
      setHasMore(data.hasMore);
    } catch {
      toast.error("Failed to load more notifications");
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleMarkRead = async (id: number) => {
    try {
      await notificationService.markAsRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    } catch {
      toast.error("Failed to update notification");
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      toast.success("All notifications marked as read");
    } catch {
      toast.error("Failed to update notifications");
    }
  };

  const handleNotificationClick = (notification: NotificationRecord) => {
    if (notification.link) navigate(notification.link);
  };

  const filteredNotifications = notifications.filter(
    (n) =>
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.message.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return {
    notifications,
    isLoading,
    hasMore,
    isLoadingMore,
    handleLoadMore,
    searchQuery,
    setSearchQuery,
    filteredNotifications,
    handleMarkRead,
    handleMarkAllRead,
    handleNotificationClick,
  };
};
