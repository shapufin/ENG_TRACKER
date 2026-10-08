const KEY = (userId: number) => `admin.palette.recents.${userId}`;
const MAX = 5;

/** Last visited palette destinations (paths), newest first. Storage is a convenience only. */
export function readRecents(userId: number | undefined): string[] {
  if (userId === undefined) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY(userId)) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((p): p is string => typeof p === "string").slice(0, MAX)
      : [];
  } catch {
    return [];
  }
}

export function pushRecent(userId: number | undefined, path: string): string[] {
  if (userId === undefined) return [];
  const next = [path, ...readRecents(userId).filter((p) => p !== path)].slice(0, MAX);
  try {
    localStorage.setItem(KEY(userId), JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
