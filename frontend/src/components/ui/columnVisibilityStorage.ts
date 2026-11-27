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

export function clearStoredColumnVisibility(storageKey: string | undefined): void {
  if (storageKey) localStorage.removeItem(storageKey);
}

/*
 * DataTable's user override (`_version: 2`). Unlike a v1 map, every entry in it
 * is a choice the user made in the Columns menu, so a `true` there pins a column
 * against auto-fit. A v1 map (and the old Reset, which wrote all-true) cannot
 * tell a choice from a default, so only its `false` entries are kept. The same
 * goes for `defaultColumnVisibility`: its `false` entries hide, its `true`
 * entries are the default anyway and never pin.
 */
const OVERRIDE_VERSION = 2;

const hiddenOnly = (visibility: Record<string, boolean> | undefined): Record<string, boolean> =>
  Object.fromEntries(Object.entries(visibility ?? {}).filter(([, visible]) => visible === false));

/** The page default as an override: only its hidden columns. */
export function defaultColumnOverride(
  defaultVisibility?: Record<string, boolean>
): Record<string, boolean> {
  return hiddenOnly(defaultVisibility);
}

export function readStoredColumnOverride(
  storageKey?: string,
  defaultVisibility?: Record<string, boolean>
): Record<string, boolean> {
  const saved = storageKey ? localStorage.getItem(storageKey) : null;
  if (!saved) return defaultColumnOverride(defaultVisibility);
  try {
    const { _version: version, ...visibility } = JSON.parse(saved) as Record<string, unknown>;
    const entries = Object.fromEntries(
      Object.entries(visibility).filter(([, v]) => typeof v === "boolean")
    ) as Record<string, boolean>;
    if (version === OVERRIDE_VERSION) return entries;
    if (version) return hiddenOnly(entries);
  } catch {
    // Unreadable: fall through to the default.
  }
  return defaultColumnOverride(defaultVisibility);
}

export function writeStoredColumnOverride(
  storageKey: string | undefined,
  override: Record<string, boolean>
): void {
  if (storageKey) {
    localStorage.setItem(storageKey, JSON.stringify({ _version: OVERRIDE_VERSION, ...override }));
  }
}
