import { useEffect, useState } from "react";
import { userService } from "@/services/userService";
import type { SelectOption } from "./MemberSelectField";

/**
 * The TL's current team members as Select options, loaded once `open` is true.
 * A failed load surfaces `loadError` — the old raw <select> silently rendered
 * an empty list, so a TL could not tell "no members" from "load failed".
 */
export const useTeamMemberOptions = (open: boolean, enabled = true) => {
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !enabled) return;
    let cancelled = false;
    userService
      .getMyTeamMembers()
      .then((profiles) => {
        if (cancelled) return;
        setOptions(
          profiles.map((p) => ({
            id: p.user.id,
            label: p.user.full_name || p.user.username,
          }))
        );
        setLoadError(null);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError("Could not load your team members. Close this dialog and try again.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, enabled]);

  return { options, loadError };
};
