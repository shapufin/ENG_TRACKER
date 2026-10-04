import type { KindConfig, RecordRow } from "./recordKinds";

/** Table column order, mirrored 1:1 in the CSV so the file matches the list. */
export const RECORDS_CSV_COLUMNS = ["ID", "Date", "Type", "With", "Focus", "State"] as const;

/** Excel/Sheets run a cell starting with these as a formula; prefix `'` so free text stays text. */
const neutralise = (value: string): string => (/^\s*[=+\-@\t\r]/.test(value) ? `'${value}` : value);

const escape = (value: string): string =>
  /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/**
 * CSV of exactly the rows shown (BOM + CRLF for Excel). Client-side on
 * purpose: the table's month/search/state filters live in the browser, so a
 * server export could not reproduce the visible set.
 */
export const recordsToCsv = (config: KindConfig<RecordRow>, rows: RecordRow[]): string => {
  const lines = [RECORDS_CSV_COLUMNS.join(",")];
  for (const row of rows) {
    lines.push(
      [
        String(row.id),
        config.date(row),
        ...[
          config.typeChip(row),
          config.person(row),
          config.focus(row) ?? "",
          config.state(row).label,
        ].map(neutralise),
      ]
        .map(escape)
        .join(",")
    );
  }
  return `\ufeff${lines.join("\r\n")}\r\n`;
};
