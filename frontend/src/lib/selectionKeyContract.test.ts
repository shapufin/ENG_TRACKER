import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A table's `rowSelection` keys are whatever its `getRowId` returns: the record id
 * when the table sets `getRowId` (HoursLogDataTable, TeamGroupedTables, ...), the
 * position in `data` when it does not. Reading a key as a list position on an
 * id-keyed table sends an empty or wrong id list to a bulk endpoint (the 2026-11-16
 * `bulk_delete` 400 `{"ids":[]}` incident, docs/workflow-invariants.md item 63).
 *
 * This guard fails on `list[Number(key)]` / `list[parseInt(key)]` in any file that
 * handles a selection. Prefer an id lookup (`selectedRecordIds`); a position lookup
 * is allowed only on a table with NO `getRowId`, listed below with the reason.
 */
const ALLOWED: Record<string, string> = {
  "lib/standbyDayGroups.ts":
    "computeDayGroups walks rows with its own loop index; selectedRecordIds reads keys as record ids.",
  "pages/team/hooks/useTLApprovalDashboard.ts":
    "Pending Approvals tables (TLApprovalTabPanel) set no getRowId, so keys are positions in the displayed rows (tabData, bundled standby days for the standby tab).",
};

const SRC = join(__dirname, "..");
const POSITION_LOOKUP =
  /\w+\s*\[\s*(?:parseInt\(\s*\w+\s*\)|Number\(\s*\w+\s*\)|\+\w+|i|idx|index)\s*\]/;

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });

describe("row selection keys", () => {
  it("flags the 2026-11-16 pattern", () => {
    expect(POSITION_LOOKUP.test("selectedIndices.map((i) => displayLogs[i])")).toBe(true);
    expect(POSITION_LOOKUP.test("rows.filter((row) => picked.has(row.id))")).toBe(false);
  });

  it("are never read as list positions outside the documented exceptions", () => {
    const offenders = sourceFiles(SRC)
      .map((file) => ({
        file: relative(SRC, file).replaceAll("\\", "/"),
        text: readFileSync(file, "utf8"),
      }))
      .filter(({ text }) => /rowSelection|getSelectedIds|selection\[/.test(text))
      .filter(({ text }) => POSITION_LOOKUP.test(text))
      .map(({ file }) => file)
      .filter((file) => !(file in ALLOWED));
    expect(offenders).toEqual([]);
  });

  it("keeps every allow-list entry alive", () => {
    for (const file of Object.keys(ALLOWED)) {
      expect(POSITION_LOOKUP.test(readFileSync(join(SRC, file), "utf8"))).toBe(true);
    }
  });
});
