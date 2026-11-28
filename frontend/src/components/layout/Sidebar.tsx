import React from "react";
import { motion } from "framer-motion";
import { PluginSlot } from "@/components/plugins/PluginSlot";
import { Clock, X, ChevronLeft, ChevronRight } from "lucide-react";
import { SidebarNav } from "./SidebarNav";
import { SidebarProfileMenu } from "./SidebarProfileMenu";
import { SidebarCollapsedContext } from "./SidebarContext";
import { useMotionTransition } from "@/lib/motion";
import { useMobileSidebarFocus } from "./useMobileSidebarFocus";
import { useSiteBranding } from "@/hooks/useSiteBranding";
import type { NavItem } from "./hooks/useVisibleNavItems";

interface SidebarProps {
  items: NavItem[];
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
  /** Mono uppercase subtitle under the brand (e.g. "Team Leader"). Hidden
   * when collapsed. Computed in AppShell from the permission flags. */
  roleSubtitle?: string;
  /** Pending-count badges keyed by nav item path. */
  badgeMap?: Record<string, number>;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  items,
  collapsed,
  mobileOpen,
  mobileMenuButtonRef,
  onToggleCollapse,
  onCloseMobile,
  user,
  roleSubtitle,
  badgeMap,
  onLogout,
}) => {
  const { data: branding } = useSiteBranding();
  // Keyed by URL, so a new logo is tried again without resetting state in an effect.
  const [failedLogoUrl, setFailedLogoUrl] = React.useState<string | null>(null);
  const logoFailed = failedLogoUrl === branding?.logo_url;
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
      id="app-mobile-sidebar"
      initial={false}
      animate={{ width: collapsed ? 76 : 264 }}
      transition={collapseTransition}
      className={`border-border/60 bg-surface-sunken fixed inset-y-0 left-0 z-50 flex flex-col border-r backdrop-blur-xl md:static ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
    >
      <div
        className={`border-border/30 flex items-center border-b px-3 py-2 ${collapsed ? "flex-col gap-2" : "justify-between"}`}
      >
        <div
          className={`flex items-center gap-2.5 text-base font-bold ${collapsed ? "justify-center" : ""}`}
        >
          {branding?.logo_url && !logoFailed ? (
            <img
              src={branding.logo_url}
              alt=""
              className="shadow-primary/30 h-7 w-7 rounded-lg object-contain shadow-md"
              onError={() => setFailedLogoUrl(branding?.logo_url ?? null)}
            />
          ) : (
            <div className="from-primary to-info shadow-primary/30 flex h-7 w-7 items-center justify-center rounded-lg bg-linear-to-tr text-white shadow-md">
              <Clock className="h-4 w-4" />
            </div>
          )}
          {!collapsed && (
            <div className="leading-tight">
              <span className="md:inline">{branding?.site_name || "Time Tracker"}</span>
              {roleSubtitle && (
                <div className="text-foreground font-mono text-xs font-semibold tracking-wider uppercase">
                  {roleSubtitle}
                </div>
              )}
            </div>
          )}
        </div>
        <div className={`flex items-center gap-1 ${collapsed ? "flex-col" : ""}`}>
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

      <SidebarCollapsedContext.Provider value={collapsed}>
        <SidebarNav
          items={items}
          collapsed={collapsed}
          onItemClick={onCloseMobile}
          badgeMap={badgeMap}
        >
          <PluginSlot slot="sidebar-nav" />
        </SidebarNav>
      </SidebarCollapsedContext.Provider>

      <div className="border-border/30 border-t px-3 pt-2 pb-[calc(0.5rem+var(--safe-area-bottom))]">
        <SidebarProfileMenu user={user} collapsed={collapsed} onLogout={onLogout} />
      </div>
    </motion.aside>
  );
};
