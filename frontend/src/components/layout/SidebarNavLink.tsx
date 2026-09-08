import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSidebarCollapsed } from "./SidebarContext";

interface SidebarNavLinkProps {
  to: string;
  label: string;
  icon: React.ElementType;
  isActive: boolean;
  onItemClick?: () => void;
  /** Collapsed state. Falls back to `useSidebarCollapsed()` context so
   * plugin-injected items (rendered via PluginSlot) can opt in without a
   * prop. Standard items pass the prop explicitly from `SidebarNav`. */
  collapsed?: boolean;
  /** Pending-count badge (e.g. open approvals). Rendered as an amber pill;
   * hidden when 0/absent or when the sidebar is collapsed. */
  badge?: number;
}

/**
 * Shared sidebar nav link used by both `SidebarNav` (standard items) and
 * plugin-injected sidebar items.
 *
 * Collapsed-mode invariants:
 * - The 3px active indicator bar is hidden when collapsed. The active item
 *   already shows `bg-primary/10` + `text-foreground`, so the bar (which sits
 *   at the link's far-left edge) is redundant and looks detached from the
 *   centered icon.
 * - The hover label is rendered via a Radix Tooltip portal (`side="right"`)
 *   instead of an absolutely-positioned `left-full` div. The nav container
 *   uses `overflow-y-auto` (which forces `overflow-x` to `auto` per CSS
 *   spec), so a non-portal tooltip would be clipped at the sidebar edge.
 *   The portal escapes the overflow container and positions next to the icon.
 */
export const SidebarNavLink: React.FC<SidebarNavLinkProps> = ({
  to,
  label,
  icon: Icon,
  isActive,
  onItemClick,
  collapsed: collapsedProp,
  badge,
}) => {
  const contextCollapsed = useSidebarCollapsed();
  const collapsed = collapsedProp ?? contextCollapsed;

  const className = `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
    isActive
      ? "bg-primary/10 text-foreground"
      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
  } ${collapsed ? "md:justify-center" : ""}`;

  const inner = (
    <>
      {isActive && !collapsed && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute inset-y-1 left-0 w-[3px] rounded-full bg-primary"
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}
      <Icon className={`h-5 w-5 shrink-0 ${isActive ? "text-primary" : ""}`} />
      {!collapsed && <span className="md:inline">{label}</span>}
      {!collapsed && badge !== undefined && badge > 0 && (
        <span
          role="status"
          aria-label={`${badge} pending approvals`}
          className="ml-auto rounded-full border border-amber-500/30 bg-amber-500/15 px-1.5 font-mono text-[10px] font-bold text-amber-700 dark:text-amber-400"
        >
          {badge}
        </span>
      )}
    </>
  );

  if (!collapsed) {
    return (
      <li>
        <Link to={to} onClick={onItemClick} role="menuitem" className={className}>
          {inner}
        </Link>
      </li>
    );
  }

  return (
    <li>
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link to={to} onClick={onItemClick} role="menuitem" className={className}>
              {inner}
            </Link>
          </TooltipTrigger>
          <TooltipContent
            side="right"
            className="rounded-md border-border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-md"
          >
            {label}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </li>
  );
};
