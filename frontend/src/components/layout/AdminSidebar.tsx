import React from "react";
import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { PluginSlot } from "@/components/plugins/PluginSlot";
import { usePlugins } from "@/context/PluginContext";
import { ChevronLeft, ChevronRight, LogOut, Shield, X } from "lucide-react";
import { SidebarUserProfile } from "./SidebarUserProfile";
import { SidebarInstallButton } from "./SidebarInstallButton";
import { useMobileSidebarFocus } from "./useMobileSidebarFocus";
import { SidebarSectionLabel } from "./SidebarSectionLabel";
import { SidebarNavLink } from "./SidebarNavLink";
import type { AdminNavItem } from "./hooks/useAdminNavItems";

interface AdminSidebarProps {
  items: AdminNavItem[];
  collapsed: boolean;
  mobileOpen: boolean;
  mobileMenuButtonRef?: React.RefObject<HTMLButtonElement | null>;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
  user?: {
    first_name?: string;
    last_name?: string;
    full_name?: string;
    username?: string;
    email?: string;
  } | null;
  onLogout: () => void;
}

const ADMIN_NAV_GROUPS = [
  "Overview",
  "People",
  "Operations",
  "Governance",
  "Tools",
  "Payroll",
  "Extensions",
  "System",
];

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  items,
  collapsed,
  mobileOpen,
  mobileMenuButtonRef,
  onToggleCollapse,
  onCloseMobile,
  user,
  onLogout,
}) => {
  const location = useLocation();
  const { getInjectedComponents } = usePlugins();
  const hasAdminPluginNav = getInjectedComponents("admin-sidebar-nav").length > 0;

  const isActive = (item: AdminNavItem) =>
    item.exact
      ? location.pathname === item.path
      : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);

  const renderItem = (item: AdminNavItem) => (
    <SidebarNavLink
      key={item.path}
      to={item.path}
      label={item.label}
      icon={item.icon}
      isActive={isActive(item)}
      collapsed={collapsed}
      onItemClick={onCloseMobile}
    />
  );

  const sidebarRef = React.useRef<HTMLElement>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const internalTriggerRef = React.useRef<HTMLButtonElement>(null);
  useMobileSidebarFocus({
    open: mobileOpen,
    onClose: onCloseMobile,
    containerRef: sidebarRef,
    closeButtonRef,
    triggerRef: mobileMenuButtonRef ?? internalTriggerRef,
  });

  return (
    <motion.aside
      ref={sidebarRef}
      id="admin-mobile-sidebar"
      initial={false}
      animate={{ width: collapsed ? 76 : 264 }}
      transition={{ type: "spring", stiffness: 350, damping: 30 }}
      className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border/60 bg-surface-sunken backdrop-blur-xl md:static ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
    >
      <div
        className={`flex items-center border-b border-border/30 p-4 ${collapsed ? "flex-col gap-2" : "justify-between"}`}
      >
        <div
          className={`flex items-center gap-2.5 text-lg font-bold ${collapsed ? "justify-center" : ""}`}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-primary to-info text-white shadow-md shadow-primary/30">
            <Shield className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <span className="md:inline">Admin Panel</span>
              <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-foreground">
                Enterprise
              </div>
            </div>
          )}
        </div>
        <div className={`flex items-center gap-1 ${collapsed ? "flex-col" : ""}`}>
          <PluginSlot slot="sidebar" />
          <button
            ref={closeButtonRef}
            onClick={onCloseMobile}
            className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-accent md:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
          <button
            onClick={onToggleCollapse}
            className="hidden rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground md:block"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3" aria-label="Admin navigation">
        <ul className="space-y-1">
          {ADMIN_NAV_GROUPS.map((group) => {
            const groupItems = items.filter((item) => item.group === group);
            const isExtensions = group === "Extensions";
            const groupHasItems = groupItems.length > 0 || (isExtensions && hasAdminPluginNav);
            if (!groupHasItems) return null;

            return (
              <React.Fragment key={group}>
                {!collapsed && <SidebarSectionLabel label={group} />}
                {groupItems.map(renderItem)}
                {isExtensions && <PluginSlot slot="admin-sidebar-nav" />}
              </React.Fragment>
            );
          })}
        </ul>
      </nav>

      <div className="space-y-3 border-t border-border/30 px-3 pb-[calc(0.75rem+var(--safe-area-bottom))] pt-3">
        <ThemeToggle isCollapsed={collapsed} />
        <SidebarInstallButton collapsed={collapsed} />
        <SidebarUserProfile user={user} collapsed={collapsed} />
        <div className={`flex gap-2 ${collapsed ? "flex-col items-center" : ""}`}>
          <Button
            variant="outline"
            size="sm"
            className={`gap-2 ${collapsed ? "w-10 justify-center p-0" : "flex-1"}`}
            onClick={onLogout}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && "Logout"}
          </Button>
        </div>
      </div>
    </motion.aside>
  );
};
