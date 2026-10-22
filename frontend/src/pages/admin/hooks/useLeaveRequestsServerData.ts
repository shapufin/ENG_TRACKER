import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePageGoneReset } from "./usePageGoneReset";
import type { AdminLeaveRequestsPage } from "@/types";

/** Rows per request: the server pages the history so it never has to fit in the browser. */
export const LEAVE_REQUESTS_PAGE_SIZE = 50;

interface LeaveRequestsPageParams {
  page?: number;
  page_size?: number;
  status?: string;
  user?: string;
  request_type?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
}

interface Filters {
  filterStatus: string;
  filterUser: string;
  filterType: string;
  dateFrom: string;
  dateTo: string;
  searchQuery: string;
}

interface Options extends Filters {
  fetchPage: (params: LeaveRequestsPageParams) => Promise<AdminLeaveRequestsPage>;
  page: number;
  setPage: (page: number) => void;
}

const NO_COUNTS = { total: 0, pending: 0, approved: 0, rejected: 0, vacation: 0, sick: 0 };

/** The active filters as request params (search is trimmed; `all` means unfiltered). */
export const buildLeaveRequestFilters = (o: Filters): LeaveRequestsPageParams => ({
  ...(o.filterStatus !== "all" && { status: o.filterStatus }),
  ...(o.filterUser !== "all" && { user: o.filterUser }),
  ...(o.filterType !== "all" && { request_type: o.filterType }),
  ...(o.dateFrom && { date_from: o.dateFrom }),
  ...(o.dateTo && { date_to: o.dateTo }),
  ...(o.searchQuery.trim() && { search: o.searchQuery.trim() }),
});

/** One server-filtered page of leave requests plus counts for the same filters. */
export const useLeaveRequestsServerData = ({ fetchPage, page, setPage, ...filters }: Options) => {
  const search = useDebouncedValue(filters.searchQuery, 300);
  const params: LeaveRequestsPageParams = {
    page,
    page_size: LEAVE_REQUESTS_PAGE_SIZE,
    ...buildLeaveRequestFilters({ ...filters, searchQuery: search }),
  };

  const query = useQuery({
    queryKey: ["admin", "leaves", "requests", params],
    queryFn: () => fetchPage(params),
    placeholderData: keepPreviousData,
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  usePageGoneReset(query.error, page, setPage);

  const requests = query.data?.results ?? [];
  return {
    requests,
    total: query.data?.count ?? 0,
    stats: query.data?.status_counts ?? NO_COUNTS,
    isLoading: query.isLoading,
    /** Call after an approve/reject/delete so removing a page's last row steps back a page. */
    onRowRemoved: () => {
      if (requests.length <= 1 && page > 1) setPage(page - 1);
    },
  };
};
