import { useCallback, useMemo, useState } from "react";
import type { NavItem } from "./useVisibleNavItems";

/** First four visible entries win, so a leader gets Approvals and an employee gets Standby. */
export const DEFAULT_PINNED_ORDER = [
  "/dashboard",
  "/team/approvals",
  "/overtime",
  "/standby",
  "/leave-management",
  "/hr/leave-requests",
  "/hr/payroll/runs",
];
export const MAX_PINNED = 4;
export const MIN_PINNED = 3;

const storageKey = (userId: number | string) => `pinned_tabs:${userId}`;

const readSaved = (userId: number | string | undefined): string[] | null => {
  if (userId == null) return null;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : null;
  } catch {
    return null;
  }
};

/**
 * Which pages the phone tab bar pins. A saved choice is per user, validated
 * against the sidebar's own visible items (a hidden page is never pinned), and
 * falls back to the role-based defaults when fewer than three remain.
 */
export const usePinnedTabs = (userId: number | string | undefined, items: NavItem[]) => {
  const [saved, setSaved] = useState<string[] | null>(() => readSaved(userId));
  const [lastUser, setLastUser] = useState(userId);
  if (lastUser !== userId) {
    setLastUser(userId);
    setSaved(readSaved(userId));
  }

  const pinnedPaths = useMemo(() => {
    const visible = new Set(items.map((item) => item.path));
    const defaults = DEFAULT_PINNED_ORDER.filter((path) => visible.has(path)).slice(0, MAX_PINNED);
    const custom = (saved ?? []).filter((path) => visible.has(path)).slice(0, MAX_PINNED);
    return saved && custom.length >= MIN_PINNED ? custom : defaults;
  }, [items, saved]);

  const customized = useMemo(() => {
    const visible = new Set(items.map((item) => item.path));
    return (saved ?? []).filter((path) => visible.has(path)).length >= MIN_PINNED;
  }, [items, saved]);

  const setPinned = useCallback(
    (paths: string[]) => {
      setSaved(paths);
      if (userId == null) return;
      try {
        localStorage.setItem(storageKey(userId), JSON.stringify(paths));
      } catch {
        // Storage blocked: the choice lasts until the page reloads.
      }
    },
    [userId]
  );

  const reset = useCallback(() => {
    setSaved(null);
    if (userId == null) return;
    try {
      localStorage.removeItem(storageKey(userId));
    } catch {
      // Nothing to clear.
    }
  }, [userId]);

  return { pinnedPaths, customized, setPinned, reset };
};
