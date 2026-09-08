/**
 * Control Room formatting utilities.
 */

export const formatHours = (hours: number): string => {
  if (hours === 0) return "0h";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours.toFixed(1)}h`;
};

export const formatPercent = (percent: number): string => {
  return `${percent.toFixed(0)}%`;
};

/**
 * Parse an ISO date string as a local-time Date (not UTC).
 *
 * `new Date("2026-07-28")` is parsed as UTC midnight; calling
 * toLocaleDateString then rolls back one day for negative UTC offsets
 * (the Americas). Appending "T00:00:00" (no "Z") forces local-time
 * parsing, matching CRByDayView's groupByDay pattern.
 */
const parseLocalDate = (isoDate: string): Date => {
  const datePart = isoDate.includes("T") ? isoDate.split("T")[0] : isoDate;
  return new Date(`${datePart}T00:00:00`);
};

export const formatDate = (isoDate: string): string => {
  if (!isoDate) return "";
  return parseLocalDate(isoDate).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

/** Compact date format for UI labels and subtitles: "Jul 1, 2026". */
export const formatDateCompact = (isoDate: string): string => {
  if (!isoDate) return "";
  return parseLocalDate(isoDate).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export const formatTime = (isoTime: string | null): string => {
  if (!isoTime) return "—";
  // isoTime may be "HH:MM:SS" or a full ISO timestamp.
  const timePart = isoTime.includes("T") ? isoTime.split("T")[1] : isoTime;
  const [h, m] = timePart.split(":");
  const hour = parseInt(h, 10);
  const minute = parseInt(m, 10);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${minute.toString().padStart(2, "0")} ${period}`;
};

export const statusColor = (status: string): string => {
  switch (status) {
    case "approved":
      return "text-green-600 dark:text-green-400";
    case "pending":
      return "text-yellow-600 dark:text-yellow-400";
    case "rejected":
      return "text-red-600 dark:text-red-400";
    default:
      return "text-muted-foreground";
  }
};

export const statusBadgeClass = (status: string): string => {
  switch (status) {
    case "approved":
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "pending":
      return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "rejected":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    default:
      return "bg-muted text-muted-foreground";
  }
};
