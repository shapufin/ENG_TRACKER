import { describe, it, expect, vi } from "vitest";
import {
  formatHours,
  formatPercent,
  formatDate,
  formatTime,
  statusColor,
  statusBadgeClass,
} from "./controlRoomFormatters";

describe("controlRoomFormatters", () => {
  describe("formatHours", () => {
    it("returns 0h for zero", () => {
      expect(formatHours(0)).toBe("0h");
    });
    it("returns minutes for sub-hour", () => {
      expect(formatHours(0.5)).toBe("30m");
    });
    it("returns hours with one decimal", () => {
      expect(formatHours(4.5)).toBe("4.5h");
    });
    it("returns whole hours without decimal", () => {
      expect(formatHours(8)).toBe("8.0h");
    });
  });

  describe("formatPercent", () => {
    it("formats with no decimals", () => {
      expect(formatPercent(75.5)).toBe("76%");
    });
  });

  describe("formatTime", () => {
    it("returns dash for null", () => {
      expect(formatTime(null)).toBe("—");
    });
    it("formats 24h time to 12h AM", () => {
      expect(formatTime("09:30:00")).toBe("9:30 AM");
    });
    it("formats 24h time to 12h PM", () => {
      expect(formatTime("14:00:00")).toBe("2:00 PM");
    });
    it("formats midnight as 12 AM", () => {
      expect(formatTime("00:00:00")).toBe("12:00 AM");
    });
    it("formats noon as 12 PM", () => {
      expect(formatTime("12:00:00")).toBe("12:00 PM");
    });
  });

  describe("formatDate", () => {
    it("returns empty string for empty input", () => {
      expect(formatDate("")).toBe("");
    });

    it("preserves the calendar day regardless of local timezone offset", () => {
      // Regression test: new Date("2026-07-28") parses as UTC midnight, so
      // toLocaleDateString in a negative-UTC-offset timezone (e.g. the
      // Americas) would render "Jul 27" instead of "Jul 28". formatDate
      // must parse the date-only string as LOCAL time to avoid this.
      vi.stubEnv("TZ", "America/Los_Angeles");
      try {
        expect(formatDate("2026-07-28")).toContain("28");
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("also handles a full ISO timestamp input", () => {
      expect(formatDate("2026-07-28T10:00:00")).toContain("28");
    });
  });

  describe("statusColor", () => {
    it("returns green for approved", () => {
      expect(statusColor("approved")).toContain("green");
    });
    it("returns yellow for pending", () => {
      expect(statusColor("pending")).toContain("yellow");
    });
    it("returns red for rejected", () => {
      expect(statusColor("rejected")).toContain("red");
    });
  });

  describe("statusBadgeClass", () => {
    it("returns badge classes for approved", () => {
      expect(statusBadgeClass("approved")).toContain("bg-green");
    });
  });
});
