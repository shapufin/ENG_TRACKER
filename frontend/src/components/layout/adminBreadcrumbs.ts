import type { AdminNavItem } from "./hooks/useAdminNavItems";

export interface Crumb {
  label: string;
  to?: string;
}

/** Plugin admin routes that are injected via PluginSlot and so are not in AdminNavItem[]. Strings only: no plugin import. */
export const ADMIN_PLUGIN_CRUMBS: Record<string, { group: string; label: string }> = {
  "/admin/analytics": { group: "Extensions", label: "Analytics" },
  "/admin/control-room": { group: "Extensions", label: "Control Room" },
  "/admin/audit-logs": { group: "System", label: "Audit Logs" },
  "/admin/backup-restore": { group: "System", label: "Backup & Restore" },
};

const matches = (pathname: string, path: string, exact?: boolean) =>
  pathname === path || (!exact && pathname.startsWith(`${path}/`));

export function resolveAdminCrumbs(pathname: string, items: AdminNavItem[]): Crumb[] {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  let best: { path: string; group: string; label: string } | null = null;
  for (const item of items) {
    if (matches(clean, item.path, item.exact) && (!best || item.path.length > best.path.length)) {
      best = { path: item.path, group: item.group, label: item.label };
    }
  }
  if (!best) {
    for (const [path, info] of Object.entries(ADMIN_PLUGIN_CRUMBS)) {
      if (matches(clean, path) && (!best || path.length > best.path.length)) {
        best = { path, ...info };
      }
    }
  }
  if (!best) return [];
  const deeper = clean !== best.path;
  const crumbs: Crumb[] = [{ label: best.group }, deeper ? { label: best.label, to: best.path } : { label: best.label }];
  if (deeper) crumbs.push({ label: "Details" });
  return crumbs;
}
