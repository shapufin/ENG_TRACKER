import React from "react";
import { User } from "lucide-react";
import { getUserDisplayName } from "@/components/calendar/initials";

interface SidebarUserProfileProps {
  user?: {
    first_name?: string;
    last_name?: string;
    full_name?: string;
    username?: string;
    email?: string;
  } | null;
  collapsed: boolean;
}

export const SidebarUserProfile: React.FC<SidebarUserProfileProps> = ({ user, collapsed }) => {
  const displayName = getUserDisplayName(user);
  return (
    <div className={`flex items-center gap-3 ${collapsed ? "md:justify-center" : ""}`}>
      <div className="bg-primary/10 relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
        <User className="text-primary h-4 w-4" />
      </div>
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={displayName}>
            {displayName}
          </p>
          {user?.email && (
            <p className="text-muted-foreground truncate text-xs" title={user.email}>
              {user.email}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
