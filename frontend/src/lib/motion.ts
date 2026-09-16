/** Centralized motion tokens — single source of truth for durations, easings,
 * shared framer-motion variants, layoutId constants, and reduced-motion
 * handling. See `.devin/context/03-FRONTEND-PATTERNS.md` §10. */
import { useReducedMotion, type Transition, type Variants } from "framer-motion";

export const DURATION = { fast: 0.12, base: 0.2, slow: 0.3 } as const;
export const EASE = { standard: [0.4, 0, 0.2, 1], out: "easeOut", inOut: "easeInOut" } as const;

/** Shared layoutId constants. `adminPluginSidebarActive` is a REAL cross-file
 * duplicate (ControlRoomAdminSidebarItem + AnalyticsAdminSidebarItem must
 * share one string so their active bars animate contiguously as siblings in
 * the admin sidebar). The filter-tab ids are each scoped to their own,
 * unrelated component — do NOT merge them into one shared id, that would
 * make two independent tab groups cross-animate if ever rendered together. */
export const LAYOUT_ID = {
  sidebarActive: "sidebar-active",
  adminPluginSidebarActive: "admin-plugin-sidebar-active",
  crUsersFilterTab: "cr-filter-tab",
  userFilterTab: "user-filter-tab",
} as const;

/** GlassCard-style mount fade/slide-up. */
export const fadeSlideUp: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0 },
};

/** Shared bulk-action-bar entrance (BulkActionBar + UsersPageBulkBar). */
export const bulkBarEnter: Variants = {
  hidden: { opacity: 0, y: -10, height: 0 },
  visible: { opacity: 1, y: 0, height: "auto" },
  exit: { opacity: 0, y: -10, height: 0 },
};

/** Small list mount stagger — safe for short, non-virtualized lists only. */
export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
};
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0 },
};

/** One-line reduced-motion-safe transition. Returns `{ duration: 0 }` when
 * the user prefers reduced motion, otherwise the given transition unchanged. */
export const useMotionTransition = (transition: Transition): Transition => {
  const reduce = useReducedMotion();
  return reduce ? { duration: 0 } : transition;
};

/** CSS-only hover tokens (Tailwind transform/opacity — no framer-motion
 * cost, GPU-composited). Use for chips/rows/pills that need the mockups'
 * hover-lift feel without a JS animation. */
export const hoverLiftClass = "transition-transform duration-150 ease-out hover:-translate-y-0.5";
export const hoverScaleClass = "transition-transform duration-150 ease-out hover:scale-[1.02]";
