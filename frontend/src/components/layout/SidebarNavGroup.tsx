import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { createPortal } from "react-dom";
import { ChevronRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSidebarCollapsed } from "./SidebarContext";

export interface SidebarNavGroupItem {
  to: string;
  label: string;
  icon: React.ElementType;
}

interface SidebarNavGroupProps {
  label: string;
  icon: React.ElementType;
  items: SidebarNavGroupItem[];
  /** Collapsed state. Falls back to `useSidebarCollapsed()` context so
   * plugin-injected groups can opt in without a prop. */
  collapsed?: boolean;
  onItemClick?: () => void;
}

const FLYOUT_WIDTH = 224;
const FLYOUT_GAP = 8;
const VIEWPORT_GUTTER = 8;
const CLOSE_DELAY = 120;

const getFlyoutPosition = (trigger: HTMLElement) => {
  const rect = trigger.getBoundingClientRect();
  const estimatedHeight = 280;
  const top = Math.min(
    Math.max(VIEWPORT_GUTTER, rect.top),
    window.innerHeight - estimatedHeight - VIEWPORT_GUTTER
  );
  const rightPosition = rect.right + FLYOUT_GAP;
  const left =
    rightPosition + FLYOUT_WIDTH <= window.innerWidth - VIEWPORT_GUTTER
      ? rightPosition
      : Math.max(VIEWPORT_GUTTER, rect.left - FLYOUT_WIDTH - FLYOUT_GAP);
  return { top, left };
};

/**
 * Collapsible sidebar nav group with a parent label and inline sub-items.
 *
 * - **Expanded sidebar**: click the parent to toggle inline sub-items.
 *   Auto-expands when a child route is active.
 * - **Collapsed sidebar**: hover/focus the parent icon to show a flyout
 *   portal with sub-items (same pattern as the admin sidebar's static
 *   sections).
 *
 * Used by plugin-injected sidebar items (e.g. Skills) to group multiple
 * nav entries under a single parent, reducing sidebar vertical space.
 */
export const SidebarNavGroup: React.FC<SidebarNavGroupProps> = ({
  label,
  icon: Icon,
  items,
  collapsed: collapsedProp,
  onItemClick,
}) => {
  const location = useLocation();
  const contextCollapsed = useSidebarCollapsed();
  const collapsed = collapsedProp ?? contextCollapsed;

  const isChildActive = (to: string) =>
    location.pathname === to || location.pathname.startsWith(`${to}/`);
  const hasActiveChild = items.some((item) => isChildActive(item.to));

  const [open, setOpen] = useState(hasActiveChild);
  const [isMobileViewport, setIsMobileViewport] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 767px)").matches
  );

  // Auto-expand when a child route becomes active. Uses the React docs
  // "adjust state during render" pattern (calling setState during render
  // is safe and avoids setState-in-effect / ref-in-render lint errors).
  const [lastPathname, setLastPathname] = useState(location.pathname);
  if (location.pathname !== lastPathname) {
    setLastPathname(location.pathname);
    if (hasActiveChild) setOpen(true);
  }

  // Track mobile viewport for collapsed-mode flyout behavior
  const flyoutRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [flyoutPos, setFlyoutPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => {
      setIsMobileViewport(e.matches);
      if (!e.matches) setOpen(hasActiveChild);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [hasActiveChild]);

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const openFlyout = () => {
    clearCloseTimer();
    if (triggerRef.current) setFlyoutPos(getFlyoutPosition(triggerRef.current));
    setOpen(true);
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      if (!hasActiveChild) setOpen(false);
    }, CLOSE_DELAY);
  };

  const handleBlur = (e: React.FocusEvent<HTMLButtonElement>) => {
    const next = e.relatedTarget as Node | null;
    if (next && flyoutRef.current?.contains(next)) return;
    scheduleClose();
  };

  const handleFlyoutBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (next && (triggerRef.current?.contains(next) || flyoutRef.current?.contains(next))) return;
    scheduleClose();
  };

  const toggle = () => setOpen((prev) => !prev);

  const parentClass = `group relative flex w-full items-center h-8 pointer-coarse:h-10 gap-2.5 rounded-lg px-2.5 text-left text-sm font-medium transition-colors ${
    hasActiveChild
      ? "bg-primary/10 text-foreground"
      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
  } ${collapsed ? "md:justify-center" : ""}`;

  const renderSubItems = () => (
    <ul className="space-y-0.5" role="menu" aria-label={`${label} submenu`}>
      {items.map((item) => {
        // The most specific matching sibling wins, so "/skills" is not also
        // highlighted while "/skills/team" is open.
        const active =
          isChildActive(item.to) &&
          !items.some((o) => o.to.length > item.to.length && isChildActive(o.to));
        const ItemIcon = item.icon;
        return (
          <li key={item.to}>
            <Link
              to={item.to}
              onClick={onItemClick}
              role="menuitem"
              aria-current={active ? "page" : undefined}
              className={`group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 pl-8 text-sm font-medium transition-colors pointer-coarse:py-2.5 ${
                active
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {active && (
                <span className="bg-primary absolute inset-y-1 left-0 w-[3px] rounded-full" />
              )}
              <ItemIcon className={`h-4 w-4 shrink-0 ${active ? "text-primary" : ""}`} />
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  // --- Collapsed mode: flyout on hover ---
  if (collapsed) {
    return (
      <li className="relative" onMouseEnter={openFlyout} onMouseLeave={scheduleClose}>
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                ref={triggerRef}
                type="button"
                className={parentClass}
                aria-label={label}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => (isMobileViewport ? toggle() : openFlyout())}
                onFocus={openFlyout}
                onBlur={handleBlur}
              >
                <Icon className={`h-4 w-4 shrink-0 ${hasActiveChild ? "text-primary" : ""}`} />
              </button>
            </TooltipTrigger>
            {!open && (
              <TooltipContent
                side="right"
                className="border-border bg-popover text-popover-foreground rounded-md px-2 py-1 text-xs font-medium shadow-md"
              >
                {label}
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        {open && isMobileViewport && (
          <div className="border-border/50 bg-muted/30 mt-1 rounded-lg border p-1">
            {renderSubItems()}
          </div>
        )}

        {open &&
          !isMobileViewport &&
          flyoutPos &&
          createPortal(
            <div
              ref={flyoutRef}
              className="border-border/70 bg-popover/95 fixed z-[100] min-w-56 rounded-lg border p-2 shadow-xl backdrop-blur-xl"
              style={{ top: flyoutPos.top, left: flyoutPos.left, width: FLYOUT_WIDTH }}
              onMouseEnter={openFlyout}
              onMouseLeave={scheduleClose}
              onFocus={openFlyout}
              onBlur={handleFlyoutBlur}
            >
              <div className="border-border/50 text-muted-foreground mb-1 border-b px-2 pb-2 text-xs font-semibold tracking-wider uppercase">
                {label}
              </div>
              {renderSubItems()}
            </div>,
            document.body
          )}
      </li>
    );
  }

  // --- Expanded mode: inline accordion ---
  return (
    <li>
      <button
        type="button"
        className={parentClass}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        {hasActiveChild && (
          <span className="bg-primary absolute inset-y-1 left-0 w-[3px] rounded-full" />
        )}
        <Icon className={`h-4 w-4 shrink-0 ${hasActiveChild ? "text-primary" : ""}`} />
        <span className="md:inline">{label}</span>
        <ChevronRight
          data-testid="sidebar-group-chevron"
          className={`ml-auto h-4 w-4 transition-transform ${open ? "rotate-90" : "rotate-0"}`}
        />
      </button>
      {open && <div className="mt-0.5 space-y-0.5">{renderSubItems()}</div>}
    </li>
  );
};
