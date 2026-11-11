/**
 * Versioned localStorage helpers for DataTable column visibility.
 *
 * Shared by DataTable and multi-table wrappers (e.g. TeamGroupedTables) so
 * persisted state uses one schema (`_version: 1`).
 */

export function readStoredColumnVisibility(
  storageKey?: string,
  defaultVisibility?: Record<string, boolean>
): Record<string, boolean> {
  if (storageKey) {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (!parsed._version) {
          localStorage.removeItem(storageKey);
          return defaultVisibility ?? {};
        }
        const visibility = { ...parsed };
        delete (visibility as { _version?: unknown })._version;
        return visibility;
      } catch {
        return defaultVisibility ?? {};
      }
    }
  }
  return defaultVisibility ?? {};
}

export function writeStoredColumnVisibility(
  storageKey: string | undefined,
  visibility: Record<string, boolean>
): void {
  if (storageKey) {
    localStorage.setItem(storageKey, JSON.stringify({ _version: 1, ...visibility }));
  }
}
