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
  // `block` is load-bearing: an inline <span> ignores max-width, so long text
  // bled into the next cell instead of ellipsizing (overtime description
  // painted over the status pill).
  return (
    <span className="text-muted-foreground block max-w-[200px] truncate text-sm">
      {value || "-"}
    </span>
  );
};
