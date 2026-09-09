/**
 * Status aggregation utilities for dashboard and reporting.
 * Centralizes logic for counting and visualizing items by status.
 */

export interface StatusChartData {
  name: string;
  value: number;
  fill: string;
}

/**
 * Aggregates items by status and returns chart-ready data.
 *
 * @param items - Array of items with a status property
 * @param colors - Array of color values [default, success, warning]
 * @returns Chart data array with status counts
 *
 * @example
 * const items = [{ status: 'pending' }, { status: 'approved' }];
 * const colors = ['#red', '#green', '#yellow'];
 * const chart = buildStatusChart(items, colors);
 * // Returns: [
 * //   { name: "Pending", value: 1, fill: "#yellow" },
 * //   { name: "Approved", value: 1, fill: "#green" },
 * //   { name: "Rejected", value: 0, fill: "#red" }
 * // ]
 */
const countStatuses = <T extends { status: string }>(items: T[] | undefined) => {
  const results = items ?? [];
  const byStatus = { pending: 0, approved: 0, rejected: 0 };

  results.forEach((item: T) => {
    if (item.status in byStatus) {
      byStatus[item.status as keyof typeof byStatus]++;
    }
  });

  return byStatus;
};

export const buildStatusChart = <T extends { status: string }>(
  items: T[] | undefined,
  colors: string[]
): StatusChartData[] => {
  const byStatus = countStatuses(items);
  return [
    { name: "Pending", value: byStatus.pending, fill: colors[2] },
    { name: "Approved", value: byStatus.approved, fill: colors[1] },
    { name: "Rejected", value: byStatus.rejected, fill: colors[3] },
  ];
};

/**
 * Counts items by status.
 * Useful for analytics or debugging.
 *
 * @param items - Array of items with a status property
 * @returns Object with counts for each status
 */
export const countByStatus = <T extends { status: string }>(
  items: T[] | undefined
): Record<string, number> => countStatuses(items);
