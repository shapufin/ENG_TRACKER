import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePageGoneReset } from "./usePageGoneReset";
import type { HoursLogStatus } from "./hoursLogsFilter";

/** Rows per request: the server pages the history so it never has to fit in the browser. */
export const HOURS_PAGE_SIZE = 50;

interface HoursStatusCounts {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

interface HoursPageParams {
  page: number;
  page_size: number;
  status?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
}

interface HoursPage<T> {
  count: number;
  results: T[];
  status_counts?: HoursStatusCounts;
}

interface Options<T> {
  queryKey: readonly unknown[];
  fetchPage: (params: HoursPageParams) => Promise<HoursPage<T>>;
  filterStatus: HoursLogStatus;
  dateFrom: string;
  dateTo: string;
  searchQuery: string;
  page: number;
  setPage: (page: number) => void;
}

const NO_COUNTS: HoursStatusCounts = { total: 0, pending: 0, approved: 0, rejected: 0 };

/**
 * One server-filtered page of the admin Hours Logs (overtime or standby) plus the
 * per-status counts for the same search/date window. Search is debounced.
 */
export const useHoursLogsServerData = <T>({
  queryKey,
  fetchPage,
  filterStatus,
  dateFrom,
  dateTo,
  searchQuery,
  page,
  setPage,
}: Options<T>) => {
  const search = useDebouncedValue(searchQuery.trim(), 300);
  const params: HoursPageParams = {
    page,
    page_size: HOURS_PAGE_SIZE,
    ...(filterStatus !== "all" && { status: filterStatus }),
    ...(dateFrom && { date_from: dateFrom }),
    ...(dateTo && { date_to: dateTo }),
    ...(search && { search }),
  };

  const query = useQuery({
    queryKey: [...queryKey, params],
    queryFn: () => fetchPage(params),
    placeholderData: keepPreviousData,
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  usePageGoneReset(query.error, page, setPage);

  const logs = query.data?.results ?? [];
  return {
    logs,
    total: query.data?.count ?? 0,
    stats: query.data?.status_counts ?? NO_COUNTS,
    isLoading: query.isLoading,
    error: query.error,
    /** Call after an approve/reject/delete so removing a page's last row steps back a page. */
    onRowRemoved: () => {
      if (logs.length <= 1 && page > 1) setPage(page - 1);
    },
  };
};
