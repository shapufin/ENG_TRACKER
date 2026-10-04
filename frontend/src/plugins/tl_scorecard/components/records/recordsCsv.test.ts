import { describe, expect, it } from "vitest";
import { recordsToCsv, RECORDS_CSV_COLUMNS } from "./recordsCsv";
import { RECORD_CONFIGS } from "./recordKinds";

const byKey = (key: string) => RECORD_CONFIGS.find((c) => c.key === key)!;

describe("recordsToCsv", () => {
  it("starts with a BOM and the header row", () => {
    const csv = recordsToCsv(byKey("idle"), []);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain(RECORDS_CSV_COLUMNS.join(","));
  });

  it("renders one row per record in table column order", () => {
    const csv = recordsToCsv(byKey("absences"), [
      { id: 3, absence_date: "2020-01-01", employee_name: "Jane" } as never,
    ]);
    expect(csv).toContain("3,2020-01-01,Absence,Jane");
  });

  it("quotes commas, quotes and newlines so Excel parses one cell", () => {
    const csv = recordsToCsv(byKey("meetings"), [
      {
        id: 1,
        occurred_on: "2026-10-04",
        meeting_type: "tl_sync",
        counterparty_name: "O'Brien, Ana",
        notes: 'Said "go"\nthen left',
        shared_summary: "",
      } as never,
    ]);
    expect(csv).toContain('"O\'Brien, Ana"');
    expect(csv).toContain('"Said ""go""\nthen left"');
  });

  it("renders missing focus as an empty cell, never the word null", () => {
    const csv = recordsToCsv(byKey("idle"), [
      { id: 7, flagged_on: "2026-09-03", employee_name: "Jane" } as never,
    ]);
    expect(csv).not.toContain("null");
    expect(csv).not.toContain("undefined");
  });

  it("neutralises formula triggers in free text so Excel never runs them", () => {
    const csv = recordsToCsv(byKey("absences"), [
      {
        id: 1,
        absence_date: "2026-10-04",
        employee_name: "=HYPERLINK(1)",
        reason: "@SUM(A1)",
      } as never,
      { id: 2, absence_date: "2026-10-04", employee_name: "Jane", reason: "-2+3" } as never,
    ]);
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).toContain("'@SUM(A1)");
    expect(csv).toContain("'-2+3");
    expect(csv).not.toMatch(/(^|,)=HYPERLINK/m);
  });
});
