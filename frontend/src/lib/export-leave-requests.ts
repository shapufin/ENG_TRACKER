import { formatDateDDMMYYYY } from "./date-format-utils";
import type { LeaveRequest } from "@/types";
import { csvCell } from "./csvSafe";

const HEADERS = ["User", "Type", "Start Date", "End Date", "Days", "Status", "Reason"];

/** Request type, with the half-day period named so the export keeps what the screen shows. */
export const leaveTypeLabel = (r: LeaveRequest) =>
  r.is_half_day ? `${r.request_type} (half day, ${r.half_day_period ?? "morning"})` : r.request_type;

export const buildLeaveRequestsCsv = (requests: LeaveRequest[]): string => {
  const rows = requests.map((r) =>
    [
      r.user_name || "Unknown",
      leaveTypeLabel(r),
      r.start_date,
      r.end_date,
      r.days_requested,
      r.status,
      r.reason || "",
    ]
      .map(csvCell)
      .join(",")
  );
  return [HEADERS.join(","), ...rows].join("\n");
};

export const exportLeaveRequestsToCSV = (requests: LeaveRequest[]) => {
  if (!requests.length) return;

  const csvContent = buildLeaveRequestsCsv(requests);
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute(
    "download",
    `leave_requests_${formatDateDDMMYYYY(new Date().toISOString())}.csv`
  );
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
