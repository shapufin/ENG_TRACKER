import React, { useRef, useState, useEffect, useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/context/PermissionContext";
import { usePlugins } from "@/context/PluginContext";
import { useLogout } from "@/hooks/useLogout";
import { Shield, Menu } from "lucide-react";
import { AdminSidebar } from "./AdminSidebar";
import { MobileOverlay } from "./MobileOverlay";
import { MainContentTransition } from "./MainContentTransition";
import { useAdminNavItems } from "./hooks/useAdminNavItems";
import { isAllowedCRAdminPath } from "./adminRouteGuards";

export const AdminShell = React.memo(() => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const { isAdmin, isHR, isTeamLeader, isSuperuser, isCRAdmin } = usePermissions();
  const { activePlugins } = usePlugins();
  const activePluginNames = useMemo(() => activePlugins.map((p) => p.name), [activePlugins]);
  const adminNavItems = useAdminNavItems(isAdmin, isHR, isSuperuser, isCRAdmin, activePluginNames);
  const isCROnlyAdmin = isCRAdmin && !isAdmin && !isSuperuser && !isHR && !isTeamLeader;
  const handleLogout = useLogout();

  // CR-only admins who manually enter the admin shell are restricted to the
  // Users page and Control Room admin area. Their normal home is the unified
  // app shell at /control-room/dashboard. Multi-role CR admins (CR + TL/HR)
  // keep their higher role's admin access. Backend permissions still enforce
  // real data visibility, so this is not a security boundary.
  useEffect(() => {
    if (isCROnlyAdmin) {
      const path = location.pathname;
      const allowed = isAllowedCRAdminPath(path);
      if (!allowed) {
        navigate("/admin/users", { replace: true });
      }
    }
  }, [isCROnlyAdmin, location.pathname, navigate]);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <MobileOverlay isOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <AdminSidebar
        items={adminNavItems}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        mobileMenuButtonRef={mobileMenuButtonRef}
        onToggleCollapse={() => setCollapsed(!collapsed)}
        onCloseMobile={() => setMobileOpen(false)}
        user={user}
        onLogout={handleLogout}
      />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border/30 bg-card/30 px-3 pb-3 pt-[calc(0.75rem+var(--safe-area-top))] backdrop-blur-sm md:hidden">
          <button
            ref={mobileMenuButtonRef}
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-accent"
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            aria-controls="admin-mobile-sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="font-semibold">Admin Panel</span>
          </div>
        </div>
        <MainContentTransition pathname={location.pathname} className="h-full">
          <div className="mx-auto w-full max-w-screen-2xl p-4 md:p-6 lg:p-8">
            <Outlet />
          </div>
        </MainContentTransition>
      </main>
    </div>
  );
});

AdminShell.displayName = "AdminShell";
