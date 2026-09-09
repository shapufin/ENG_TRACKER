import type { CalendarEvent } from "@/components/calendar/types";
import { format } from "date-fns";

const downloadBlob = (blob: Blob, filename: string) => {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const exportToCSV = (events: CalendarEvent[], filename: string = "calendar-events") => {
  const csvField = (value: string) => `"${(value || "").replace(/"/g, '""')}"`;
  const headers = [
    "Title",
    "Start Date",
    "End Date",
    "Type",
    "Status",
    "User Name",
    "Days",
    "Hours",
    "Description",
  ];

  const rows = events.map((event) => [
    csvField(event.title),
    event.start,
    event.end,
    event.type,
    event.status,
    csvField(event.userName || ""),
    event.days || "",
    event.hours || "",
    csvField(event.description || ""),
  ]);

  const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `${filename}.csv`);
};

export const exportToICal = (events: CalendarEvent[], filename: string = "calendar-events") => {
  const icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Engineering Tracker//Calendar Export//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events.map((event) => {
      const startDate = format(new Date(event.start), "yyyyMMdd");
      const endDate = format(new Date(event.end), "yyyyMMdd");
      const summary = event.title.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,");
      const description = (event.description || "")
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,");

      return [
        "BEGIN:VEVENT",
        `DTSTART;VALUE=DATE:${startDate}`,
        `DTEND;VALUE=DATE:${endDate}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${description}`,
        `UID:${event.id}@engineering-tracker`,
        "STATUS:CONFIRMED",
        "END:VEVENT",
      ].join("\r\n");
    }),
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8;" });
  downloadBlob(blob, `${filename}.ics`);
};
