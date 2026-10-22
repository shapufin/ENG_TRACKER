import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { useLeaveRequestFilters } from "./useLeaveRequestFilters";
import { useLeaveRequestsServerData, LEAVE_REQUESTS_PAGE_SIZE } from "./useLeaveRequestsServerData";

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
  status_counts: { total: 120, pending: 5, approved: 100, rejected: 15, vacation: 90, sick: 30 },
};

const setup = (fetchPage = vi.fn().mockResolvedValue(response)) => {
  const hook = renderHook(
    () => {
      const filters = useLeaveRequestFilters();
      return { filters, data: useLeaveRequestsServerData({ fetchPage, ...filters }) };
    },
    { wrapper }
  );
  return { ...hook, fetchPage };
};

describe("useLeaveRequestsServerData", () => {
  it("asks the server for one filtered page and returns its counts", async () => {
    const { result, fetchPage } = setup();
    await waitFor(() => expect(result.current.data.requests).toHaveLength(1));
    expect(fetchPage).toHaveBeenLastCalledWith({ page: 1, page_size: LEAVE_REQUESTS_PAGE_SIZE });
    expect(result.current.data.total).toBe(120);
    expect(result.current.data.stats.vacation).toBe(90);

    act(() => result.current.filters.setFilterUser("7"));
    act(() => result.current.filters.setFilterType("vacation"));
    act(() => result.current.filters.setFilterStatus("pending"));
    await waitFor(() =>
      expect(fetchPage).toHaveBeenLastCalledWith({
        page: 1,
        page_size: LEAVE_REQUESTS_PAGE_SIZE,
        user: "7",
        request_type: "vacation",
        status: "pending",
      })
    );
  });

  it("returns to page 1 on a filter change and steps back after removing the last row", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.data.requests).toHaveLength(1));
    act(() => result.current.filters.setPage(3));
    act(() => result.current.filters.setDateFrom("2026-09-01"));
    expect(result.current.filters.page).toBe(1);

    act(() => result.current.filters.setPage(2));
    await waitFor(() => expect(result.current.data.requests).toHaveLength(1));
    act(() => result.current.data.onRowRemoved());
    expect(result.current.filters.page).toBe(1);
  });
});
