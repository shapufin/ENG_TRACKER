import { describe, it, expect } from "vitest";
import { csvCell } from "./csvSafe";
import { buildLeaveRequestsCsv } from "./export-leave-requests";
import type { LeaveRequest } from "@/types";

describe("csvCell", () => {
  it.each([
    ['=HYPERLINK("x")', `"'=HYPERLINK(""x"")"`],
    ["+1", "'+1"],
    ["-2", "'-2"],
    ["@a", "'@a"],
    ["\tx", "'\tx"],
    ["\rx", `"'\rx"`],
  ])("neutralises a leading formula character: %j", (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  it("quotes cells containing commas, quotes or newlines", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
  });

  it("passes plain text and numbers through unchanged", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell(3.5)).toBe("3.5");
    expect(csvCell(-3)).toBe("-3");
  });

  it("renders null and undefined as empty", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
});

describe("buildLeaveRequestsCsv", () => {
  const base = {
    user_name: "Ana",
    request_type: "vacation",
    start_date: "2026-10-12",
    end_date: "2026-10-13",
    days_requested: 2,
    status: "approved",
  } as unknown as LeaveRequest;

  it("neutralises a formula in the reason", () => {
    const csv = buildLeaveRequestsCsv([{ ...base, reason: "=cmd|' /C calc'!A0" } as LeaveRequest]);
    expect(csv.split("\n")[1]).toContain(`'=cmd|' /C calc'!A0`);
    expect(csv.split("\n")[1]).not.toMatch(/,=cmd/);
  });

  it("keeps a reason with a comma inside one cell (7 columns)", () => {
    const csv = buildLeaveRequestsCsv([{ ...base, reason: "family, trip" } as LeaveRequest]);
    expect(csv.split("\n")[1]).toBe('Ana,vacation,2026-10-12,2026-10-13,2,approved,"family, trip"');
  });

  it("keeps a multi-line reason in one record", () => {
    const csv = buildLeaveRequestsCsv([{ ...base, reason: "a\nb" } as LeaveRequest]);
    expect(csv.endsWith('"a\nb"')).toBe(true);
  });
});
