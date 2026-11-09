import React, { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavItem } from "./hooks/useVisibleNavItems";
import { DEFAULT_PINNED_ORDER, MAX_PINNED, MIN_PINNED } from "./hooks/usePinnedTabs";

/** Total bar height incl. the home-indicator inset; fixed notices read it so none covers the tabs. */
const BAR_HEIGHT = "calc(3.5rem + var(--safe-area-bottom, 0px))";

interface MobileBottomNavProps {
  /** The sidebar's own visible items: a page the sidebar hides is never pinned. */
  items: NavItem[];
  /** Pages to pin, in order (the user's choice); defaults to the role-based daily pages. */
  pinnedPaths?: string[];
  /** Pending counts keyed by nav path. */
  badgeMap?: Record<string, number>;
  onOpenMore: () => void;
  moreOpen?: boolean;
}

/** Phone-only shorter labels so a tab never truncates; the link keeps the full label as its name. */
const PHONE_LABEL: Record<string, string> = {
  "/dashboard": "Home",
  "/team/approvals": "Pending",
  "/hr/leave-requests": "Requests",
  "/hr/payroll/runs": "Payroll",
};

const isActive = (pathname: string, path: string) =>
  pathname === path || (path !== "/dashboard" && pathname.startsWith(`${path}/`));

/**
 * Phone tab bar: the pages people use daily one tap away, everything else
 * behind More (the existing drawer). Hidden from md up where the sidebar shows.
 */
export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  items,
  pinnedPaths = DEFAULT_PINNED_ORDER,
  badgeMap = {},
  onOpenMore,
  moreOpen = false,
}) => {
  const { pathname } = useLocation();
  const byPath = new Map(items.map((item) => [item.path, item]));
  const pinned = pinnedPaths
    .map((path) => byPath.get(path))
    .filter((item): item is NavItem => Boolean(item))
    .slice(0, MAX_PINNED);
  const show = pinned.length >= MIN_PINNED;

  useEffect(() => {
    if (!show) return;
    const root = document.documentElement;
    root.style.setProperty("--bottom-nav-h", BAR_HEIGHT);
    return () => {
      root.style.removeProperty("--bottom-nav-h");
    };
  }, [show]);

  if (!show) return null;

  const tab =
    "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium focus-visible:ring-focus focus-visible:ring-2 focus-visible:outline-hidden touch-manipulation";

  return (
    <div className="border-border/70 bg-card sticky bottom-0 z-30 shrink-0 border-t pb-[var(--safe-area-bottom)] md:hidden">
      <nav aria-label="Primary" className="flex items-stretch">
        {pinned.map(({ path, label, icon: Icon }) => {
          const active = isActive(pathname, path);
          const badge = badgeMap[path];
          return (
            <Link
              key={path}
              to={path}
              aria-label={PHONE_LABEL[path] ? label : undefined}
              aria-current={active ? "page" : undefined}
              className={cn(tab, active ? "text-primary" : "text-muted-foreground")}
            >
              <span className="relative">
                <Icon className="h-5 w-5" aria-hidden="true" />
                {badge ? (
                  <span className="bg-tone-warning-surface text-tone-warning-text ring-card absolute -top-2 -right-4 min-w-5 rounded-full px-1 text-center text-xs leading-5 font-semibold ring-2">
                    {badge}
                  </span>
                ) : null}
              </span>
              <span className="max-w-full truncate">{PHONE_LABEL[path] ?? label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onOpenMore}
          aria-expanded={moreOpen}
          aria-controls="app-mobile-sidebar"
          className={cn(tab, "text-muted-foreground")}
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          More
        </button>
      </nav>
    </div>
  );
};
