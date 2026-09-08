import { useState, useMemo, useCallback } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { ticketKPIService } from "../../services/ticketKPIService";
import type { TicketQueryFilters } from "../../types/ticketKPI";

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export interface UseTicketKPITicketsArgs {
  /** Single month (YYYY-MM-DD). Mutually exclusive with `year`. */
  month?: string;
  /** Full year (YYYY). Mutually exclusive with `month`. */
  year?: number;
  userId?: number;
  enabled?: boolean;
}

/**
 * Server-side paginated + filtered query for a user's normalized ticket rows
 * for a given month OR year. Exposes filter state, the dynamic `available_fields`
 * and `filter_options` returned by the backend, and pagination controls.
 *
 * Query key includes every parameter that changes the result (month/year, userId,
 * page, page_size, and each filter field) per the project query-key rules.
 */
export const useTicketKPITickets = ({
  month,
  year,
  userId,
  enabled = true,
}: UseTicketKPITicketsArgs) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [filters, setFilters] = useState<TicketQueryFilters>({});

  const timeKey = month ?? (year ? `year-${year}` : "none");

  const queryKey = useMemo(
    () => [
      "ticket_kpi",
      "tickets",
      timeKey,
      userId ?? "self",
      page,
      pageSize,
      filters.status ?? "",
      filters.priority ?? "",
      filters.category ?? "",
      filters.assignee ?? "",
      filters.requester ?? "",
      filters.search ?? "",
      filters.sla_breached === undefined ? "" : String(filters.sla_breached),
      JSON.stringify(filters.dynamicFields ?? {}),
    ],
    [timeKey, userId, page, pageSize, filters]
  );

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey,
    queryFn: () =>
      ticketKPIService.getTickets({
        month,
        year,
        user_id: userId,
        page,
        page_size: pageSize,
        filters,
      }),
    enabled: enabled && (!!month || !!year) && !!userId,
    placeholderData: keepPreviousData,
    retry: 1,
  });

  const updateFilter = useCallback(
    <K extends keyof TicketQueryFilters>(key: K, value: TicketQueryFilters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
      setPage(1);
    },
    []
  );

  const updateDynamicField = useCallback((field: string, value: string) => {
    setFilters((prev) => ({
      ...prev,
      dynamicFields: { ...prev.dynamicFields, [field]: value },
    }));
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({});
    setPage(1);
  }, []);

  const availableFields = data?.available_fields ?? [];
  const filterOptions = data?.filter_options ?? {
    status: [],
    priority: [],
    category: [],
    assignee: [],
    requester: [],
  };
  const totalCount = data?.count ?? 0;
  const totalPages = data?.total_pages ?? 1;

  return {
    data,
    isLoading,
    isFetching,
    isError,
    page,
    pageSize,
    setPage,
    setPageSize: (size: number) => {
      setPageSize(size);
      setPage(1);
    },
    pageSizeOptions: PAGE_SIZE_OPTIONS,
    filters,
    updateFilter,
    updateDynamicField,
    resetFilters,
    availableFields,
    filterOptions,
    totalCount,
    totalPages,
  };
};
