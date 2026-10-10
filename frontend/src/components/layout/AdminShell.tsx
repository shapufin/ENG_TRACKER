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
import { AdminBreadcrumbNav } from "./AdminBreadcrumbNav";
import { isAllowedCRAdminPath } from "./adminRouteGuards";
import { AdminCommandPalette } from "./AdminCommandPalette";

export const AdminShell = React.memo(() => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
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

  // Ctrl/Cmd+K toggles the page palette. preventDefault stops the browser's own
  // Ctrl+K (focus the address/search bar) from winning.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="bg-background text-foreground flex h-screen">
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
        onOpenPalette={() => setPaletteOpen(true)}
      />
      <AdminCommandPalette
        items={adminNavItems}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        userId={user?.id}
      />

      <main className="admin-canvas flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="border-border/30 bg-card/30 flex items-center gap-3 border-b px-3 pt-[calc(0.75rem+var(--safe-area-top))] pb-3 backdrop-blur-sm md:hidden">
          <button
            ref={mobileMenuButtonRef}
            type="button"
            onClick={() => setMobileOpen(true)}
            className="hover:bg-accent flex h-11 w-11 items-center justify-center rounded-md"
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            aria-controls="admin-mobile-sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="text-primary h-4 w-4" />
            <span className="font-semibold">Admin Panel</span>
          </div>
        </div>
        <MainContentTransition pathname={location.pathname} className="h-full">
          <div className="mx-auto w-full max-w-screen-2xl px-4 py-4 md:px-6 md:py-5 lg:px-8 lg:py-6">
            <AdminBreadcrumbNav items={adminNavItems} />
            <Outlet />
          </div>
        </MainContentTransition>
      </main>
    </div>
  );
});

AdminShell.displayName = "AdminShell";
