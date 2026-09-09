/** Calculate hours between two HH:MM times, supporting midnight crossing.
 *  Rounds up to the next full hour if any partial hour exists (e.g., 1h 1min = 2h).
 *  Example: 18:00 → 09:00 = 15h.
 */
export const calculateHours = (start: string, end: string): number | null => {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startMins = sh * 60 + (sm || 0);
  let endMins = eh * 60 + (em || 0);
  if (endMins <= startMins) endMins += 24 * 60;
  const diffHours = (endMins - startMins) / 60;
  return Math.ceil(diffHours);
};

/** Validate that end time is within 24 hours of start time.
 *  Supports overnight shifts (end <= start means end is next day).
 *  Returns an error message string if invalid, null if valid.
 *  Returns null if either time is empty (presence is caller's responsibility).
 */
export const validateTimeRange = (start: string, end: string): string | null => {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startMins = sh * 60 + sm;
  let endMins = eh * 60 + em;
  if (endMins <= startMins) endMins += 24 * 60;
  if (endMins - startMins > 24 * 60) return "End time must be within 24 hours of start time";
  return null;
};
