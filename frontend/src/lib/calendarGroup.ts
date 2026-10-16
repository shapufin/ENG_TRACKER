/**
 * Mirrors `normalize_calendar_group` in apps/users/models/core.py: trim,
 * lowercase, whitespace runs become '-'. The server is the source of truth;
 * this only previews the stored name before the user confirms.
 */
export const normalizeCalendarGroup = (value: string): string =>
  value.toLowerCase().split(/\s+/).filter(Boolean).join("-");
