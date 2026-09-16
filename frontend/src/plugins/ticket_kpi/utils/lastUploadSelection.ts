/**
 * Remembers the profile + clients a user picked on their last ticket upload.
 *
 * A given client's export format almost never changes month to month, so
 * re-picking the same profile and the same clients every single month is
 * pure friction. Scoped per user (multiple people can share a browser
 * profile on a shared machine) and validated against whatever is actually
 * selectable right now — a deactivated profile or a removed client
 * assignment must never come back from storage as a silent, invisible
 * default.
 */
const STORAGE_KEY_PREFIX = "ticket_kpi_last_upload_selection";

export interface LastUploadSelection {
  profileId: number | null;
  clientIds: number[];
}

const keyFor = (userId: number): string => `${STORAGE_KEY_PREFIX}:${userId}`;

export function saveLastUploadSelection(userId: number, selection: LastUploadSelection): void {
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(selection));
  } catch {
    // Storage can be unavailable (private browsing, quota) — losing the
    // convenience is fine, it must never break the upload itself.
  }
}

/**
 * Read back the last selection, filtered to ids present in ``validProfileIds``
 * / ``validClientIds`` so a since-deactivated profile or removed client
 * assignment is silently dropped rather than resurrected.
 */
export function getLastUploadSelection(
  userId: number,
  validProfileIds: Set<number>,
  validClientIds: Set<number>
): LastUploadSelection | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(keyFor(userId));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LastUploadSelection;
    const profileId =
      typeof parsed.profileId === "number" && validProfileIds.has(parsed.profileId)
        ? parsed.profileId
        : null;
    const clientIds = Array.isArray(parsed.clientIds)
      ? parsed.clientIds.filter((id) => validClientIds.has(id))
      : [];
    if (profileId === null && clientIds.length === 0) return null;
    return { profileId, clientIds };
  } catch {
    return null;
  }
}
