/** Columns and cell text for the ticket-mapping preview tables. */

// `raw_data` is the whole uploaded row as an object; it only prints "[object Object]".
const HIDDEN_COLUMNS = new Set(["raw_data"]);

export const previewColumns = (row: Record<string, unknown>): string[] =>
  Object.keys(row).filter((key) => !HIDDEN_COLUMNS.has(key));

export const previewCell = (value: unknown): string =>
  value === null || value === undefined || value === "" ? "—" : String(value);

/** The API sends null for a metric that was not computed. */
export const formatHours = (value: number | null | undefined): string =>
  value != null ? `${value}h` : "N/A";

export const formatPct = (value: number | null | undefined): string =>
  value != null ? `${value}%` : "N/A";
