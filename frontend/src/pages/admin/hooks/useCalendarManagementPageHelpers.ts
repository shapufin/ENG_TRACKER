import type { PublicHoliday } from "@/types";

export const buildHolidayFormValues = (holiday: PublicHoliday | undefined) => {
  if (!holiday)
    return {
      name: "",
      date: "",
      country_code: "",
      is_global: true,
      description: "",
      calendar: "global",
    };
  return {
    name: holiday.name,
    date: holiday.date,
    country_code: holiday.country_code ?? "",
    is_global: holiday.is_global,
    description: holiday.description ?? "",
    calendar: holiday.calendar ? String(holiday.calendar) : "global",
  };
};
