import { describe, expect, it } from "vitest";
import { previewCell, previewColumns } from "./previewTable";

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
