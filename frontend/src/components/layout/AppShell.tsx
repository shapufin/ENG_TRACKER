import React, { useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/context/PermissionContext";
import { useLogout } from "@/hooks/useLogout";
import { PluginSlot } from "@/components/plugins/PluginSlot";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { MobileOverlay } from "./MobileOverlay";
import { MainContentTransition } from "./MainContentTransition";
import { useVisibleNavItems } from "./hooks/useVisibleNavItems";
import { usePendingApprovalCount } from "@/hooks/usePendingApprovalCount";

export const AppShell = React.memo(() => {
  const { user } = useAuth();
  const { isAdmin, isHR, isTeamLeader, isEmployee, isSuperuser, isCRAdmin, isCRUser } =
    usePermissions();
  // Sidebar brand subtitle — higher role wins (mirrors the CR multi-role
  // rule). Uppercase display is handled by the subtitle's `uppercase` class.
  const roleSubtitle = isSuperuser
    ? "Admin"
    : isAdmin
      ? "Admin"
      : isHR
        ? "HR"
        : isTeamLeader
          ? "Team Leader"
          : isCRUser || isCRAdmin
            ? "Control Room"
            : "Employee";
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const visibleItems = useVisibleNavItems(
    isAdmin,
    isHR,
    isTeamLeader,
    isEmployee,
    isSuperuser,
    isCRAdmin,
    isCRUser
  );
  const handleLogout = useLogout();
  // Pending-approvals nav badge (mockup: amber count pill). Reuses the
  // approval dashboard's pending-months cache; 0 renders no badge.
  const { total: pendingApprovalTotal } = usePendingApprovalCount(isTeamLeader);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <MobileOverlay isOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <Sidebar
        items={visibleItems}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        mobileMenuButtonRef={mobileMenuButtonRef}
        onToggleCollapse={() => setCollapsed(!collapsed)}
        onCloseMobile={() => setMobileOpen(false)}
        user={user}
        roleSubtitle={roleSubtitle}
        badgeMap={pendingApprovalTotal > 0 ? { "/team/approvals": pendingApprovalTotal } : {}}
        onLogout={handleLogout}
      />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/30 bg-card/30 px-3 pb-3 pt-[calc(0.75rem+var(--safe-area-top))] backdrop-blur-sm md:hidden">
          <div className="flex items-center gap-3">
            <button
              ref={mobileMenuButtonRef}
              type="button"
              onClick={() => setMobileOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-accent"
              aria-label="Open menu"
              aria-expanded={mobileOpen}
              aria-controls="app-mobile-sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="font-semibold">TimeTracker</span>
          </div>
          <div className="flex items-center gap-2">
            <PluginSlot slot="header-mobile" />
          </div>
        </div>
        <div className="hidden border-b border-border/60 bg-card/10 px-8 py-3 backdrop-blur-sm md:flex md:items-center md:justify-end">
          <div className="flex items-center gap-2">
            <PluginSlot slot="header-desktop" />
          </div>
        </div>
        <MainContentTransition pathname={location.pathname} className="h-full">
          <div
            className={`p-4 md:p-6 lg:p-8 ${location.pathname.startsWith("/calendar") ? "w-full" : "mx-auto w-full max-w-screen-2xl"}`}
          >
            <Outlet />
          </div>
        </MainContentTransition>
      </main>
    </div>
  );
});
