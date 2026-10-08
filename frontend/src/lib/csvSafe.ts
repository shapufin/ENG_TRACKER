const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One RFC-4180 CSV cell. Free text that starts with `= + - @`, tab or CR is
 * prefixed with `'` so spreadsheets treat it as text, not a formula. Numbers are
 * emitted as-is (a negative number is not an injection vector).
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  let text = String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
