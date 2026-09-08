import React from "react";

interface DescriptionColumnProps {
  value: string | null | undefined;
}

/**
 * Reusable description column for admin log pages.
 * Shows truncated description with fallback to dash.
 *
 * Extracted from duplicated code in:
 * - LeaveRequestsPage (reason field)
 * - OvertimeLogsPage (description field)
 * - StandbyLogsPage (description field)
 */
export const DescriptionColumn: React.FC<DescriptionColumnProps> = ({ value }) => {
  return (
    <span className="max-w-[200px] truncate text-sm text-muted-foreground">{value || "-"}</span>
  );
};
