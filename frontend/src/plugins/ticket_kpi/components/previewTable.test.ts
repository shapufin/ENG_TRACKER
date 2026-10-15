import { describe, expect, it } from "vitest";
import { formatHours, formatPct, previewCell, previewColumns } from "./previewTable";

describe("ticket preview table helpers", () => {
  it("drops the raw_data object column", () => {
    expect(previewColumns({ raw_data: {}, ticket_id: "INC1", title: "x" })).toEqual([
      "ticket_id",
      "title",
    ]);
  });

  it("renders missing values as a dash instead of 'null'", () => {
    expect(previewCell(null)).toBe("—");
    expect(previewCell(undefined)).toBe("—");
    expect(previewCell("")).toBe("—");
    expect(previewCell(false)).toBe("false");
    expect(previewCell(3.5)).toBe("3.5");
  });
});

// The API sends null (not undefined) when a metric was not computed; the report
// used to print "nullh" / "null%".
describe("ticket report metric formatters", () => {
  it("shows N/A for metrics that were not computed", () => {
    expect(formatHours(null)).toBe("N/A");
    expect(formatPct(null)).toBe("N/A");
  });

  it("formats computed metrics, including zero", () => {
    expect(formatHours(4.5)).toBe("4.5h");
    expect(formatPct(0)).toBe("0%");
  });
});
