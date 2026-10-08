import { useCallback, useState } from "react";

const KEY = (userId: number) => `admin.dashboard.dismissedInsights.${userId}`;
const MAX = 50;

const read = (userId: number | undefined): string[] => {
  if (userId === undefined) return [];
  try {
    const raw = localStorage.getItem(KEY(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
};

/**
 * Per-user, per-signature insight dismissals. A signature embeds the number the
 * insight was derived from, so a dismissed insight returns when its data changes.
 * Storage is a convenience only: any failure falls back to in-memory state.
 */
export function useDismissedInsights(userId: number | undefined) {
  const [dismissed, setDismissed] = useState<string[]>(() => read(userId));

  const isDismissed = useCallback((signature: string) => dismissed.includes(signature), [dismissed]);

  const dismiss = useCallback(
    (signature: string) => {
      setDismissed((prev) => {
        const next = [...prev.filter((s) => s !== signature), signature].slice(-MAX);
        if (userId !== undefined) {
          try {
            localStorage.setItem(KEY(userId), JSON.stringify(next));
          } catch {
            /* in-memory only */
          }
        }
        return next;
      });
    },
    [userId]
  );

  return { isDismissed, dismiss };
}
