import { useCallback, useContext, useEffect, useState, type RefObject } from "react";
import { AuthContext } from "@/context/auth-context-base";

const read = (key: string): string[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "null") as { closed?: unknown } | null;
    return Array.isArray(parsed?.closed)
      ? parsed.closed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
};

/**
 * Open/closed state of collapsible sidebar sections, persisted per scope and
 * user. Sections default to open. The section holding the active route is
 * always open, except that the user may close it by hand until the route
 * moves to another section.
 */
export const useSidebarGroups = (scope: "app" | "admin", activeSection: string | null) => {
  // Read the context directly (not useAuth, which throws outside a provider)
  // so isolated sidebar renders and tests keep working.
  const userId = useContext(AuthContext)?.user?.id ?? "anon";
  const key = `sidebar_groups:${scope}:${userId}`;
  const [closed, setClosed] = useState<string[]>(() => read(key));
  const [dismissed, setDismissed] = useState<string | null>(null);

  // Adjust state during render: a new active section ends an earlier dismissal.
  const [lastActive, setLastActive] = useState(activeSection);
  if (activeSection !== lastActive) {
    setLastActive(activeSection);
    setDismissed(null);
  }

  const isOpen = useCallback(
    (id: string) => {
      if (id === activeSection) return dismissed !== id;
      return !closed.includes(id);
    },
    [activeSection, dismissed, closed]
  );

  const toggle = useCallback(
    (id: string) => {
      if (id === activeSection) {
        setDismissed((prev) => (prev === id ? null : id));
        return;
      }
      setClosed((prev) => {
        const next = prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id];
        try {
          localStorage.setItem(key, JSON.stringify({ closed: next }));
        } catch {
          // Storage unavailable (private mode): keep the in-memory state.
        }
        return next;
      });
    },
    [activeSection, key]
  );

  return { isOpen, toggle };
};

/**
 * Section holding the link marked `aria-current="page"` inside `navRef`.
 * Plugin-injected links are not in the static item lists, so the active
 * section is read from the DOM after each navigation (bodies stay mounted
 * while closed, so a hidden active link is still found).
 */
export const useDomActiveSection = (
  navRef: RefObject<HTMLElement | null>,
  pathname: string,
  rescanKey: number
): string | null => {
  const [found, setFound] = useState<{ path: string; section: string } | null>(null);
  useEffect(() => {
    const section = navRef.current
      ?.querySelector('[aria-current="page"]')
      ?.closest("[data-sidebar-section]")
      ?.getAttribute("data-sidebar-section");
    setFound(section ? { path: pathname, section } : null);
  }, [navRef, pathname, rescanKey]);
  return found?.path === pathname ? found.section : null;
};
