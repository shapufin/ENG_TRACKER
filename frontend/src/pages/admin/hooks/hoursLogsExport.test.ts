import { describe, it, expect } from "vitest";
import { buildHoursExportParams } from "./hoursLogsExport";

describe("buildHoursExportParams", () => {
  it("omits status and dates when unset but always ignores the month scope", () => {
    expect(buildHoursExportParams("all", "", "")).toEqual({ ignore_date_filter: "true" });
  });

  it("passes the active status and date range", () => {
    expect(buildHoursExportParams("pending", "2026-09-01", "2026-09-30")).toEqual({
      status: "pending",
      date_from: "2026-09-01",
      date_to: "2026-09-30",
      ignore_date_filter: "true",
    });
  });
});
