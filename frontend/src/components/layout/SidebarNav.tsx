import React from "react";
import { useLocation } from "react-router-dom";
import { usePlugins } from "@/context/PluginContext";
import { PluginSlot } from "@/components/plugins/PluginSlot";
import { SidebarNavLink } from "./SidebarNavLink";
import { SidebarSectionLabel } from "./SidebarSectionLabel";
import { NAV_SECTION_LABELS, NAV_SECTION_ORDER } from "./hooks/useVisibleNavItems";
import type { NavItem } from "./hooks/useVisibleNavItems";

interface SidebarNavProps {
  items: NavItem[];
  collapsed: boolean;
  onItemClick: () => void;
  children?: React.ReactNode;
  /** Pending-count badges keyed by item path (e.g. { "/team/approvals": 3 }). */
  badgeMap?: Record<string, number>;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  items,
  collapsed,
  onItemClick,
  children,
  badgeMap,
}) => {
  const location = useLocation();
  const injectedSidebarNav = usePlugins().getInjectedComponents("sidebar-nav");
  // Only items with no declared `section` fall into the generic "Plugins"
  // bucket — section-scoped items render inline under their own section
  // group below instead (see the `groups.map` loop).
  const hasPluginNav = injectedSidebarNav.some((item) => !item.section);

  // Pinned items (e.g. Settings) render after section groups AND
  // plugin-injected items so they are always the last entries in the nav,
  // regardless of user type or installed plugins.
  const flowItems = items.filter((item) => !item.pinToEnd);
  const pinnedItems = items.filter((item) => item.pinToEnd);

  const groups = NAV_SECTION_ORDER.map((section) => ({
    section,
    items: flowItems.filter((item) => item.section === section),
    // A section can be worth rendering purely for a plugin-injected item —
    // e.g. an employee with no static "leadership" items (Team Overview is
    // team_leader-only) but with Onboarding access, which declares
    // section: "leadership" on its own gating.
    hasInjectedItems: injectedSidebarNav.some((item) => item.section === section),
  })).filter((group) => group.items.length > 0 || group.hasInjectedItems);

  const renderItem = (item: NavItem) => {
    const isActive = item.exact
      ? location.pathname === item.path
      : location.pathname.startsWith(item.path);
    return (
      <SidebarNavLink
        key={item.path}
        to={item.path}
        label={item.label}
        icon={item.icon}
        isActive={isActive}
        collapsed={collapsed}
        onItemClick={onItemClick}
        badge={badgeMap?.[item.path]}
      />
    );
  };

  return (
    <nav className="flex-1 overflow-y-auto p-3" aria-label="Main navigation">
      <ul className="space-y-0.5">
        {groups.map(({ section, items }) => (
          <React.Fragment key={section}>
            {!collapsed && <SidebarSectionLabel label={NAV_SECTION_LABELS[section]} />}
            {items.map(renderItem)}
            <PluginSlot slot="sidebar-nav" section={section} />
          </React.Fragment>
        ))}
        {hasPluginNav && !collapsed && <SidebarSectionLabel label="Plugins" />}
        {children}
        {pinnedItems.length > 0 && (
          <li aria-hidden="true" className={collapsed ? "" : "mt-2 border-t border-border/50 pt-2"} />
        )}
        {pinnedItems.map(renderItem)}
      </ul>
    </nav>
  );
};
