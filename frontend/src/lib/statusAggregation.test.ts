import { describe, it, expect } from "vitest";
import { buildStatusChart, countByStatus } from "./statusAggregation";

const expectEmptyChart = (result: ReturnType<typeof buildStatusChart>, colors: string[]) => {
  expect(result).toEqual([
    { name: "Pending", value: 0, fill: colors[2] },
    { name: "Approved", value: 0, fill: colors[1] },
    { name: "Rejected", value: 0, fill: colors[3] },
  ]);
};

describe("statusAggregation", () => {
  describe("buildStatusChart", () => {
    it("should return empty chart for undefined data", () => {
      const colors = ["#red", "#green", "#yellow", "#blue"];
      const result = buildStatusChart(undefined, colors);
      expectEmptyChart(result, colors);
    });

    it("should return empty chart for empty array", () => {
      const colors = ["#red", "#green", "#yellow", "#blue"];
      const result = buildStatusChart([], colors);
      expectEmptyChart(result, colors);
    });

    it("should aggregate items by status", () => {
      const items = [
        { id: 1, status: "pending" },
        { id: 2, status: "approved" },
        { id: 3, status: "approved" },
        { id: 4, status: "rejected" },
      ];
      const colors = ["#red", "#green", "#yellow", "#blue"];
      const result = buildStatusChart(items, colors);

      expect(result).toEqual([
        { name: "Pending", value: 1, fill: colors[2] },
        { name: "Approved", value: 2, fill: colors[1] },
        { name: "Rejected", value: 1, fill: colors[3] },
      ]);
    });

    it("should ignore unknown statuses", () => {
      const items = [
        { id: 1, status: "pending" },
        { id: 2, status: "unknown" },
        { id: 3, status: "approved" },
      ];
      const result = buildStatusChart(items, ["#1", "#2", "#3"]);

      expect(result[0].value).toBe(1); // pending
      expect(result[1].value).toBe(1); // approved
      expect(result[2].value).toBe(0); // rejected
    });

    it("should use correct color indices", () => {
      const items = [{ status: "pending" }, { status: "approved" }, { status: "rejected" }];
      const colors = ["color0", "color1", "color2", "color3"];
      const result = buildStatusChart(items, colors);

      expect(result[0].fill).toBe("color2"); // pending uses colors[2]
      expect(result[1].fill).toBe("color1"); // approved uses colors[1]
      expect(result[2].fill).toBe("color3"); // rejected uses colors[3]
    });
  });

  describe("countByStatus", () => {
    it("should return zero counts for undefined data", () => {
      const result = countByStatus(undefined);
      expect(result).toEqual({
        pending: 0,
        approved: 0,
        rejected: 0,
      });
    });

    it("should return status counts", () => {
      const items = [
        { id: 1, status: "pending" },
        { id: 2, status: "approved" },
        { id: 3, status: "approved" },
      ];
      const result = countByStatus(items);

      expect(result).toEqual({
        pending: 1,
        approved: 2,
        rejected: 0,
      });
    });

    it("should ignore unknown statuses", () => {
      const items = [
        { id: 1, status: "pending" },
        { id: 2, status: "unknown" },
        { id: 3, status: "approved" },
      ];
      const result = countByStatus(items);

      expect(result).toEqual({
        pending: 1,
        approved: 1,
        rejected: 0,
      });
    });
  });
});
