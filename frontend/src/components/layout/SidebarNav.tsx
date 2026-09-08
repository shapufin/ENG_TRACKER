import React from "react";
import { useLocation } from "react-router-dom";
import { usePlugins } from "@/context/PluginContext";
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
  const { getInjectedComponents } = usePlugins();
  const hasPluginNav = getInjectedComponents("sidebar-nav").length > 0;

  const groups = NAV_SECTION_ORDER.map((section) => ({
    section,
    items: items.filter((item) => item.section === section),
  })).filter((group) => group.items.length > 0);

  return (
    <nav className="flex-1 overflow-y-auto p-3" aria-label="Main navigation">
      <ul className="space-y-0.5">
        {groups.map(({ section, items }) => (
          <React.Fragment key={section}>
            {!collapsed && <SidebarSectionLabel label={NAV_SECTION_LABELS[section]} />}
            {items.map((item) => {
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
            })}
          </React.Fragment>
        ))}
        {hasPluginNav && !collapsed && <SidebarSectionLabel label="Plugins" />}
        {children}
      </ul>
    </nav>
  );
};
