export type HoursStatusFilter = "all" | "pending" | "approved" | "rejected";

export interface HoursExportParams {
  status?: string;
  date_from?: string;
  date_to?: string;
  ignore_date_filter: "true";
}

/**
 * Params for /overtime|standby/logs/export/ matching the admin table's status and date
 * filters. The admin list is not month-scoped, so the export must not be either
 * (`ignore_date_filter`), otherwise it silently drops past months.
 */
export const buildHoursExportParams = (
  status: HoursStatusFilter,
  dateFrom: string,
  dateTo: string
): HoursExportParams => ({
  ...(status !== "all" && { status }),
  ...(dateFrom && { date_from: dateFrom }),
  ...(dateTo && { date_to: dateTo }),
  ignore_date_filter: "true",
});
