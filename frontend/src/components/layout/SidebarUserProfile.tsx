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
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <User className="h-4 w-4 text-primary" />
      </div>
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={displayName}>
            {displayName}
          </p>
          {user?.email && (
            <p className="truncate text-[10px] text-muted-foreground" title={user.email}>
              {user.email}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
