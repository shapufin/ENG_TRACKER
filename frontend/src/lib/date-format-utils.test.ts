import { describe, it, expect, vi, afterEach } from "vitest";
import {
  formatDateDDMMYYYY,
  formatDateTime,
  parseDDMMYYYYDate,
  toLocalISODate,
  parseLocalDate,
  isPastMonth,
} from "./date-format-utils";

describe("formatDateDDMMYYYY", () => {
  it("formats an ISO date string", () => {
    expect(formatDateDDMMYYYY("2024-06-15")).toBe("15/06/2024");
  });

  it("returns empty string for null or empty input", () => {
    expect(formatDateDDMMYYYY(null)).toBe("");
    expect(formatDateDDMMYYYY("")).toBe("");
  });

  it("returns empty string for invalid date", () => {
    expect(formatDateDDMMYYYY("invalid")).toBe("");
  });

  it("formats a Date object", () => {
    expect(formatDateDDMMYYYY(new Date("2024-06-15T00:00:00"))).toBe("15/06/2024");
  });
});

describe("formatDateTime", () => {
  it("formats a date with time", () => {
    const result = formatDateTime("2024-06-15T14:30:00");
    expect(result).toContain("15/06/2024");
    expect(result).toContain("14:30");
  });

  it("returns empty string for null input", () => {
    expect(formatDateTime(null)).toBe("");
  });
});

describe("parseDDMMYYYYDate", () => {
  it("parses a valid DD/MM/YYYY date", () => {
    const result = parseDDMMYYYYDate("15/06/2024");
    expect(result).toBeInstanceOf(Date);
    expect(result?.getFullYear()).toBe(2024);
    expect(result?.getMonth()).toBe(5);
    expect(result?.getDate()).toBe(15);
  });

  it("returns null for empty input", () => {
    expect(parseDDMMYYYYDate("")).toBeNull();
  });

  it("returns null for invalid format", () => {
    expect(parseDDMMYYYYDate("2024-06-15")).toBeNull();
    expect(parseDDMMYYYYDate("15/06")).toBeNull();
  });

  it("returns null for non-numeric parts", () => {
    expect(parseDDMMYYYYDate("ab/06/2024")).toBeNull();
  });

  it("returns null for out-of-range year", () => {
    expect(parseDDMMYYYYDate("15/06/999")).toBeNull();
    expect(parseDDMMYYYYDate("15/06/10000")).toBeNull();
  });

  it("returns null for invalid calendar date", () => {
    expect(parseDDMMYYYYDate("31/02/2024")).toBeNull();
  });

  it("returns null for month out of range", () => {
    expect(parseDDMMYYYYDate("15/13/2024")).toBeNull();
  });
});

describe("toLocalISODate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("formats a local date as YYYY-MM-DD", () => {
    // July 15, 2026 — constructed as local midnight.
    const d = new Date(2026, 6, 15);
    expect(toLocalISODate(d)).toBe("2026-07-15");
  });

  it("pads single-digit month and day", () => {
    const d = new Date(2026, 0, 5);
    expect(toLocalISODate(d)).toBe("2026-01-05");
  });

  it("handles December 31 (year boundary)", () => {
    const d = new Date(2026, 11, 31);
    expect(toLocalISODate(d)).toBe("2026-12-31");
  });

  it("does NOT shift the date in positive UTC offset (UTC+2)", () => {
    // In UTC+2, new Date(2026, 6, 1) local midnight is 2026-06-30T22:00:00Z.
    // toISOString().split("T")[0] would yield "2026-06-30" (wrong).
    // toLocalISODate must yield "2026-07-01" (correct).
    vi.stubEnv("TZ", "Europe/Tirane");
    const d = new Date(2026, 6, 1);
    expect(toLocalISODate(d)).toBe("2026-07-01");
  });

  it("does NOT shift the date in negative UTC offset (UTC-5)", () => {
    // In UTC-5, new Date(2026, 6, 1) local midnight is 2026-07-01T05:00:00Z.
    // toISOString().split("T")[0] would yield "2026-07-01" (happens to work).
    // But last day of month: new Date(2026, 7, 0) = July 31 local = Aug 1 04:00 UTC.
    // toISOString would yield "2026-08-01" (wrong). toLocalISODate → "2026-07-31".
    vi.stubEnv("TZ", "America/New_York");
    const d = new Date(2026, 6, 31);
    expect(toLocalISODate(d)).toBe("2026-07-31");
  });
});

describe("parseLocalDate", () => {
  it("parses YYYY-MM-DD as a local date", () => {
    const d = parseLocalDate("2026-07-15");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(15);
  });

  it("parses January 1 (month/day boundary)", () => {
    const d = parseLocalDate("2026-01-01");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
  });

  it("roundtrips with toLocalISODate", () => {
    const iso = "2026-07-15";
    expect(toLocalISODate(parseLocalDate(iso))).toBe(iso);
  });
});

describe("isPastMonth", () => {
  it("returns true for a date in a previous month of the same year", () => {
    const now = new Date();
    const pastMonth = now.getMonth() > 0 ? now.getMonth() : 12;
    const pastYear = now.getMonth() > 0 ? now.getFullYear() : now.getFullYear() - 1;
    const iso = `${pastYear}-${String(pastMonth).padStart(2, "0")}-15`;
    expect(isPastMonth(iso)).toBe(true);
  });

  it("returns false for a date in the current month", () => {
    const now = new Date();
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-15`;
    expect(isPastMonth(iso)).toBe(false);
  });

  it("returns false for a date in a future month", () => {
    const now = new Date();
    const futureMonth = now.getMonth() < 11 ? now.getMonth() + 2 : 1;
    const futureYear = now.getMonth() < 11 ? now.getFullYear() : now.getFullYear() + 1;
    const iso = `${futureYear}-${String(futureMonth).padStart(2, "0")}-15`;
    expect(isPastMonth(iso)).toBe(false);
  });

  it("returns true for a date in a previous year", () => {
    const iso = `${new Date().getFullYear() - 1}-06-15`;
    expect(isPastMonth(iso)).toBe(true);
  });

  it("returns false for null/empty/invalid input", () => {
    expect(isPastMonth(null)).toBe(false);
    expect(isPastMonth("")).toBe(false);
    expect(isPastMonth("invalid")).toBe(false);
    expect(isPastMonth(undefined)).toBe(false);
  });

  it("treats the last day of the previous month as past", () => {
    const now = new Date();
    const firstOfCurrent = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastOfPrev = new Date(firstOfCurrent.getTime() - 1);
    const iso = `${lastOfPrev.getFullYear()}-${String(lastOfPrev.getMonth() + 1).padStart(2, "0")}-${String(lastOfPrev.getDate()).padStart(2, "0")}`;
    expect(isPastMonth(iso)).toBe(true);
  });
});
