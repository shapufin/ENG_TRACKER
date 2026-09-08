import { describe, it, expect } from "vitest";
import { buildHolidayFormValues } from "./useCalendarManagementPageHelpers";
import type { PublicHoliday } from "@/types";

describe("buildHolidayFormValues", () => {
  it("returns defaults for new holiday", () => {
    expect(buildHolidayFormValues(undefined)).toEqual({
      name: "",
      date: "",
      country_code: "",
      is_global: true,
      description: "",
      calendar: "global",
    });
  });

  it("maps existing holiday fields", () => {
    const holiday: PublicHoliday = {
      id: 1,
      name: "Christmas",
      date: "2024-12-25",
      country_code: "IT",
      is_global: false,
      description: "Holiday",
      calendar: 5,
    } as PublicHoliday;
    expect(buildHolidayFormValues(holiday)).toEqual({
      name: "Christmas",
      date: "2024-12-25",
      country_code: "IT",
      is_global: false,
      description: "Holiday",
      calendar: "5",
    });
  });

  it("falls back to global when calendar is missing", () => {
    const holiday = { name: "Day", date: "2024-01-01", is_global: true } as PublicHoliday;
    expect(buildHolidayFormValues(holiday).calendar).toBe("global");
  });
});
