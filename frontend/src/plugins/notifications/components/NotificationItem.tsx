import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { type NotificationRecord } from "../service";
import { Bell, CheckCircle2, AlertCircle, XCircle } from "lucide-react";

interface NotificationItemProps {
  notification: NotificationRecord;
  onMarkRead: (id: number) => void;
}

const getTypeIcon = (type: string) => {
  switch (type) {
    case "success":
      return <CheckCircle2 className="text-success h-5 w-5" />;
    case "warning":
      return <AlertCircle className="text-warning h-5 w-5" />;
    case "error":
      return <XCircle className="text-destructive h-5 w-5" />;
    default:
      return <Bell className="text-primary h-5 w-5" />;
  }
};

export const NotificationItem: React.FC<NotificationItemProps> = ({ notification, onMarkRead }) => {
  const navigate = useNavigate();

  const handleClick = () => {
    if (notification.link) navigate(notification.link);
  };

  const handleMarkRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    onMarkRead(notification.id);
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        "hover:bg-muted/50 flex gap-4 p-4 transition-colors",
        !notification.is_read && "bg-primary/5",
        notification.link && "cursor-pointer"
      )}
    >
      <div className="mt-1 shrink-0">{getTypeIcon(notification.notification_type)}</div>
      <div className="flex-1 space-y-1">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <h4 className={cn("text-sm font-semibold", !notification.is_read && "text-primary")}>
              {notification.title}
            </h4>
            {!notification.is_read && <Badge className="h-4 px-1 text-xs uppercase">New</Badge>}
          </div>
          <span className="text-muted-foreground text-xs whitespace-nowrap">
            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
          </span>
        </div>
        <p className="text-muted-foreground text-sm">{notification.message}</p>
        {!notification.is_read && (
          <Button
            variant="ghost"
            size="control-sm"
            className="px-2 text-xs"
            onClick={handleMarkRead}
          >
            Mark as read
          </Button>
        )}
      </div>
    </div>
  );
};
