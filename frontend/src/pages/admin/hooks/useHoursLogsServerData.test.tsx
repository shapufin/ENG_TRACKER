import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useHoursLogsFilterState } from "./hoursLogsFilter";
import { useHoursLogsServerData, HOURS_PAGE_SIZE } from "./useHoursLogsServerData";
import { MemoryRouter } from "react-router-dom";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{children}</MemoryRouter>
  </QueryClientProvider>
);

const response = {
  count: 120,
  next: null,
  previous: null,
  results: [{ id: 1 }],
  status_counts: { total: 120, pending: 5, approved: 100, rejected: 15 },
};

describe("useHoursLogsServerData", () => {
  it("asks the server for one filtered page and returns its counts", async () => {
    const fetchPage = vi.fn().mockResolvedValue(response);
    const { result } = renderHook(
      () => {
        const filters = useHoursLogsFilterState();
        return {
          filters,
          data: useHoursLogsServerData({ queryKey: ["t"], fetchPage, ...filters }),
        };
      },
      { wrapper }
    );

    await waitFor(() => expect(result.current.data.logs).toHaveLength(1));
    expect(fetchPage).toHaveBeenLastCalledWith({ page: 1, page_size: HOURS_PAGE_SIZE });
    expect(result.current.data.total).toBe(120);
    expect(result.current.data.stats).toEqual(response.status_counts);

    act(() => result.current.filters.setFilterStatus("pending"));
    act(() => result.current.filters.setDateFrom("2026-09-01"));
    await waitFor(() =>
      expect(fetchPage).toHaveBeenLastCalledWith({
        page: 1,
        page_size: HOURS_PAGE_SIZE,
        status: "pending",
        date_from: "2026-09-01",
      })
    );
  });

  it("goes back to page 1 when a filter changes and steps back after removing the last row", async () => {
    const fetchPage = vi.fn().mockResolvedValue(response);
    const { result } = renderHook(
      () => {
        const filters = useHoursLogsFilterState();
        return {
          filters,
          data: useHoursLogsServerData({ queryKey: ["t2"], fetchPage, ...filters }),
        };
      },
      { wrapper }
    );
    await waitFor(() => expect(result.current.data.logs).toHaveLength(1));

    act(() => result.current.filters.setPage(3));
    await waitFor(() =>
      expect(fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({ page: 3 }))
    );
    act(() => result.current.filters.setFilterStatus("approved"));
    expect(result.current.filters.page).toBe(1);

    act(() => result.current.filters.setPage(2));
    await waitFor(() => expect(result.current.data.logs).toHaveLength(1));
    act(() => result.current.data.onRowRemoved());
    expect(result.current.filters.page).toBe(1);
  });
});
