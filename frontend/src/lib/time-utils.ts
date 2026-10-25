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

/** Read what someone typed into a time field and return it as 24-hour "HH:mm".
 *  Accepts "9", "09", "930", "0930", "9:30", "9.30", and 12-hour forms such as
 *  "9pm" or "12am". Returns null when it is not a real time of day.
 */
export const parseTypedTime = (typed: string): string | null => {
  const match = typed.trim().toLowerCase().match(/^(\d{1,2})(?:[:.]?(\d{2}))?\s*([ap])?m?$/);
  if (!match) {
    return null;
  }
  const [, hourText, minuteText, meridiem] = match;
  let hour = Number(hourText);
  const minute = minuteText ? Number(minuteText) : 0;
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem === "p" ? 12 : 0);
  } else if (hour > 23) {
    return null;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

/** "AM" before noon and "PM" from noon for a 24-hour "HH:mm" value, "" otherwise. */
export const dayPeriod = (time: string): "AM" | "PM" | "" => {
  const match = time.match(/^(\d{2}):\d{2}/);
  if (!match) return "";
  return Number(match[1]) < 12 ? "AM" : "PM";
};
