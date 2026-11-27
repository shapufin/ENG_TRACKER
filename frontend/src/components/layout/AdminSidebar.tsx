import React from "react";
import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { PluginSlot } from "@/components/plugins/PluginSlot";
import { usePlugins } from "@/context/PluginContext";
import { useSiteBranding } from "@/hooks/useSiteBranding";
import { ChevronLeft, ChevronRight, Search, Shield, X } from "lucide-react";
import { SidebarProfileMenu } from "./SidebarProfileMenu";
import { useMobileSidebarFocus } from "./useMobileSidebarFocus";
import { SidebarSection } from "./SidebarSection";
import { useDomActiveSection, useSidebarGroups } from "@/hooks/useSidebarGroups";
import { SidebarNavLink } from "./SidebarNavLink";
import type { AdminNavItem } from "./hooks/useAdminNavItems";
import { useMotionTransition } from "@/lib/motion";

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
  /** Renders the "Search pages" trigger when provided (Ctrl/Cmd+K palette). */
  onOpenPalette?: () => void;
}

const ADMIN_NAV_GROUPS = [
  "Overview",
  "People",
  "Operations",
  "Payroll",
  "Skills & KPI",
  "Governance",
  "System",
  "Extensions",
];

// Platform is fixed for the page lifetime, so read it once.
const PALETTE_SHORTCUT = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? "")
  ? "⌘ K"
  : "Ctrl K";

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  items,
  collapsed,
  mobileOpen,
  mobileMenuButtonRef,
  onToggleCollapse,
  onCloseMobile,
  user,
  onLogout,
  onOpenPalette,
}) => {
  const location = useLocation();
  const { getInjectedComponents } = usePlugins();
  const hasAdminPluginNav = getInjectedComponents("admin-sidebar-nav").length > 0;
  const hasAdminPluginNavSystem = getInjectedComponents("admin-sidebar-nav-system").length > 0;
  const { data: branding } = useSiteBranding();
  // Keyed by URL, so a new logo is tried again without resetting state in an effect.
  const [failedLogoUrl, setFailedLogoUrl] = React.useState<string | null>(null);
  const logoFailed = failedLogoUrl === branding?.logo_url;

  const isActive = (item: AdminNavItem) =>
    item.exact
      ? location.pathname === item.path
      : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);

  const navRef = React.useRef<HTMLElement>(null);
  const domActive = useDomActiveSection(
    navRef,
    location.pathname,
    getInjectedComponents("admin-sidebar-nav").length +
      getInjectedComponents("admin-sidebar-nav-system").length
  );
  const activeGroup = items.find(isActive)?.group ?? domActive;
  const { isOpen, toggle } = useSidebarGroups("admin", activeGroup);

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
  const collapseTransition = useMotionTransition({ type: "spring", stiffness: 350, damping: 30 });

  return (
    <motion.aside
      ref={sidebarRef}
      id="admin-mobile-sidebar"
      initial={false}
      animate={{ width: collapsed ? 76 : 264 }}
      transition={collapseTransition}
      className={`border-border/60 bg-surface-sunken fixed inset-y-0 left-0 z-50 flex flex-col border-r backdrop-blur-xl md:static ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
    >
      <div
        className={`border-border/30 flex items-center border-b px-3 py-2 ${collapsed ? "flex-col gap-2" : "justify-between"}`}
      >
        <div
          className={`flex min-w-0 items-center gap-2.5 text-base font-bold ${collapsed ? "justify-center" : ""}`}
        >
          {branding?.logo_url && !logoFailed ? (
            <img
              src={branding.logo_url}
              alt=""
              className="shadow-primary/30 h-7 w-7 shrink-0 rounded-lg object-contain shadow-md"
              onError={() => setFailedLogoUrl(branding?.logo_url ?? null)}
            />
          ) : (
            <div className="from-primary to-info shadow-primary/30 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-linear-to-tr text-white shadow-md">
              <Shield className="h-4 w-4" />
            </div>
          )}
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <span className="block truncate text-sm">
                {branding?.site_name || "Admin Panel"}
              </span>
              <div className="text-foreground font-mono text-xs font-semibold tracking-wider uppercase">
                Enterprise
              </div>
            </div>
          )}
        </div>
        <div className={`flex items-center gap-1 ${collapsed ? "flex-col" : ""}`}>
          {onOpenPalette && (
            <button
              type="button"
              onClick={onOpenPalette}
              aria-label="Search pages"
              title={`Search pages (${PALETTE_SHORTCUT.replace(" ", "+")})`}
              className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-8 w-8 items-center justify-center rounded-md"
            >
              <Search className="h-4 w-4" aria-hidden />
            </button>
          )}
          <PluginSlot slot="sidebar" />
          <button
            ref={closeButtonRef}
            onClick={onCloseMobile}
            className="hover:bg-accent flex h-11 w-11 items-center justify-center rounded-md md:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
          <button
            onClick={onToggleCollapse}
            className="text-muted-foreground hover:bg-accent hover:text-foreground hidden rounded-md p-1 md:block"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <nav ref={navRef} className="flex-1 overflow-y-auto p-3" aria-label="Admin navigation">
        <ul className="space-y-0.5">
          {ADMIN_NAV_GROUPS.map((group) => {
            const groupItems = items.filter((item) => item.group === group);
            const isExtensions = group === "Extensions";
            const isSystem = group === "System";
            const groupHasItems =
              groupItems.length > 0 ||
              (isExtensions && hasAdminPluginNav) ||
              (isSystem && hasAdminPluginNavSystem);
            if (!groupHasItems) return null;

            return (
              <SidebarSection
                key={group}
                id={group}
                label={group}
                open={isOpen(group)}
                onToggle={() => toggle(group)}
                collapsed={collapsed}
              >
                {groupItems.map(renderItem)}
                {isExtensions && <PluginSlot slot="admin-sidebar-nav" />}
                {isSystem && <PluginSlot slot="admin-sidebar-nav-system" />}
              </SidebarSection>
            );
          })}
        </ul>
      </nav>

      <div className="border-border/30 border-t px-3 pt-2 pb-[calc(0.5rem+var(--safe-area-bottom))]">
        <SidebarProfileMenu user={user} collapsed={collapsed} onLogout={onLogout} />
      </div>
    </motion.aside>
  );
};
