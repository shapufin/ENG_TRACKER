import { formatDateDDMMYYYY } from "./date-format-utils";
import type { LeaveRequest } from "@/types";

export const exportLeaveRequestsToCSV = (requests: LeaveRequest[]) => {
  if (!requests.length) return;

  const headers = ["User", "Type", "Start Date", "End Date", "Days", "Status", "Reason"];
  const csvData = requests.map((r) => [
    r.user_name || "Unknown",
    r.request_type,
    r.start_date,
    r.end_date,
    r.days_requested,
    r.status,
    (r.reason || "").replace(/,/g, ";"),
  ]);

  const csvContent = [headers.join(","), ...csvData.map((row) => row.join(","))].join("\n");
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
