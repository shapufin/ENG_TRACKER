import { describe, it, expect } from "vitest";
import { getNextPendingMonth, toMonthKey, getMonthRange } from "./pendingMonthNavigation";

describe("pendingMonthNavigation", () => {
  describe("getNextPendingMonth", () => {
    it("returns null when no months available", () => {
      expect(getNextPendingMonth([], "2026-03")).toBeNull();
    });

    it("returns the first month after the current month", () => {
      const months = [
        { month: "2026-01-01", count: 2 },
        { month: "2026-03-01", count: 5 },
        { month: "2026-05-01", count: 1 },
      ];
      expect(getNextPendingMonth(months, "2026-02")).toBe("2026-03-01");
    });

    it("wraps to the first month when current is at the last pending month", () => {
      const months = [
        { month: "2026-01-01", count: 2 },
        { month: "2026-03-01", count: 5 },
      ];
      expect(getNextPendingMonth(months, "2026-05")).toBe("2026-01-01");
    });

    it("wraps to the first month when current equals the last pending month", () => {
      const months = [
        { month: "2026-01-01", count: 2 },
        { month: "2026-03-01", count: 5 },
      ];
      expect(getNextPendingMonth(months, "2026-03")).toBe("2026-01-01");
    });

    it("returns the first month when current is before all pending months", () => {
      const months = [{ month: "2026-03-01", count: 5 }];
      expect(getNextPendingMonth(months, "2026-01")).toBe("2026-03-01");
    });

    it("returns the first month when current is the only pending month (wrap)", () => {
      const months = [{ month: "2026-03-01", count: 5 }];
      expect(getNextPendingMonth(months, "2026-03")).toBe("2026-03-01");
    });
  });

  describe("toMonthKey", () => {
    it("extracts YYYY-MM from YYYY-MM-DD", () => {
      expect(toMonthKey("2026-03-15")).toBe("2026-03");
    });
  });

  describe("getMonthRange", () => {
    it("returns first and last day of the month", () => {
      const range = getMonthRange("2026-03-01");
      expect(range.firstDay).toBe("2026-03-01");
      expect(range.lastDay).toBe("2026-03-31");
    });

    it("handles February correctly", () => {
      const range = getMonthRange("2026-02-01");
      expect(range.firstDay).toBe("2026-02-01");
      expect(range.lastDay).toBe("2026-02-28");
    });

    it("handles December correctly", () => {
      const range = getMonthRange("2026-12-01");
      expect(range.firstDay).toBe("2026-12-01");
      expect(range.lastDay).toBe("2026-12-31");
    });
  });
});
