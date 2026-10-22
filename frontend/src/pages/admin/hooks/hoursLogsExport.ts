export type HoursStatusFilter = "all" | "pending" | "approved" | "rejected";

export interface HoursExportParams {
  status?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  ignore_date_filter: "true";
}

/**
 * Params for /overtime|standby/logs/export/ matching the admin table's status and date
 * filters. The admin list is not month-scoped, so the export must not be either
 * (`ignore_date_filter`), otherwise it silently drops past months. The search box
 * is forwarded so the file matches the rows on screen.
 */
export const buildHoursExportParams = (
  status: HoursStatusFilter,
  dateFrom: string,
  dateTo: string,
  search = ""
): HoursExportParams => ({
  ...(status !== "all" && { status }),
  ...(dateFrom && { date_from: dateFrom }),
  ...(dateTo && { date_to: dateTo }),
  ...(search.trim() && { search: search.trim() }),
  ignore_date_filter: "true",
});
