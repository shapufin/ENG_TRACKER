import React from "react";
import { useNavigate } from "react-router-dom";
import { Check, Download, LogOut, Monitor, Moon, Settings, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getInitials, getUserDisplayName } from "@/components/calendar/initials";
import { useTheme } from "@/context/ThemeContext";
import { useInstallAction } from "./useInstallAction";

interface SidebarProfileMenuProps {
  user?: {
    first_name?: string;
    last_name?: string;
    full_name?: string;
    username?: string;
    email?: string;
  } | null;
  collapsed: boolean;
  /** The shell's logout handler (it owns the unsent-offline-changes confirmation). */
  onLogout: () => void;
}

const THEMES = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const;

/** One-row account footer: avatar + name, opening theme, install, settings and log out. */
export const SidebarProfileMenu: React.FC<SidebarProfileMenuProps> = ({
  user,
  collapsed,
  onLogout,
}) => {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const { canShow: canInstall, install, dialog } = useInstallAction(triggerRef);
  // The install dialog opens only after the menu has closed and released focus,
  // otherwise the two focus traps fight each other.
  const installPending = React.useRef(false);
  const displayName = getUserDisplayName(user);
  const initials = getInitials(displayName);

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      aria-label={`Account menu, ${displayName}`}
      className={`hover:bg-accent focus-visible:ring-ring flex h-10 items-center gap-2.5 rounded-lg text-left transition-colors outline-none focus-visible:ring-2 ${collapsed ? "w-10 justify-center" : "w-full px-2"}`}
    >
      <span className="bg-primary/10 text-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
        {initials}
      </span>
      {!collapsed && (
        <span className="min-w-0 flex-1 truncate text-sm font-medium" title={displayName}>
          {displayName}
        </span>
      )}
    </button>
  );

  return (
    <div className={collapsed ? "flex justify-center" : undefined}>
      <DropdownMenu>
        {collapsed ? (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="right">{displayName}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        )}
        <DropdownMenuContent
          side="top"
          align="start"
          className="w-56"
          onCloseAutoFocus={(e) => {
            if (!installPending.current) return;
            installPending.current = false;
            e.preventDefault();
            void install();
          }}
        >
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          {THEMES.map(({ value, label, Icon }) => (
            <DropdownMenuItem
              key={value}
              onSelect={(e) => {
                e.preventDefault();
                setTheme(value);
              }}
              aria-label={`${label} theme`}
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span className="flex-1">{label}</span>
              {theme === value && <Check className="h-4 w-4" aria-hidden />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {canInstall && (
            <DropdownMenuItem
              onSelect={() => {
                installPending.current = true;
              }}
            >
              <Download className="h-4 w-4" aria-hidden /> Install app
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => navigate("/settings")}>
            <Settings className="h-4 w-4" aria-hidden /> Settings
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive" onSelect={onLogout}>
            <LogOut className="h-4 w-4" aria-hidden /> Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog}
    </div>
  );
};
