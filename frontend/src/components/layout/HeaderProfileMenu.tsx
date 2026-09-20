import React from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Settings } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getInitials, getUserDisplayName } from "@/components/calendar/initials";

interface HeaderProfileMenuProps {
  user?: {
    first_name?: string;
    last_name?: string;
    full_name?: string;
    username?: string;
    email?: string;
  } | null;
  roleSubtitle?: string;
  onLogout: () => void;
}

export const HeaderProfileMenu: React.FC<HeaderProfileMenuProps> = ({
  user,
  roleSubtitle,
  onLogout,
}) => {
  const navigate = useNavigate();
  const displayName = getUserDisplayName(user);
  const initials = getInitials(displayName);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
        >
          {initials}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end">
        <div className="flex items-center gap-3 border-b p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={displayName}>
              {displayName}
            </p>
            {roleSubtitle && (
              <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {roleSubtitle}
              </p>
            )}
          </div>
        </div>
        <div className="p-1">
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
          >
            <Settings className="h-4 w-4" /> Settings
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-destructive hover:bg-accent"
          >
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
