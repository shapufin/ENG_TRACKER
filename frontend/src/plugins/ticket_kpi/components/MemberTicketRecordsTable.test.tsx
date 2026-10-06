import React from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { MemberTicketRecordsTable } from "./MemberTicketRecordsTable";
import { useTicketKPITickets } from "../pages/hooks/useTicketKPITickets";

vi.mock("../pages/hooks/useTicketKPITickets", () => ({
  useTicketKPITickets: vi.fn(),
}));

const hookState = (page: number) => ({
  data: { results: [], count: 20 },
  isLoading: false,
  isFetching: false,
  isError: false,
  page,
  setPage: vi.fn(),
  pageSize: 10,
  setPageSize: vi.fn(),
  pageSizeOptions: [10],
  totalPages: 2,
  totalCount: 20,
  filters: {},
  setFilters: vi.fn(),
  updateFilter: vi.fn(),
  updateDynamicField: vi.fn(),
  resetFilters: vi.fn(),
  availableFields: ["ticket_id", "title"],
  filterOptions: {},
  columns: ["ticket_id", "title"],
  visibleColumns: ["ticket_id", "title"],
  toggleColumn: vi.fn(),
  showColumnMenu: false,
  setShowColumnMenu: vi.fn(),
});

describe("MemberTicketRecordsTable pager", () => {
  it("names the previous/next page buttons for assistive technology", () => {
    vi.mocked(useTicketKPITickets).mockReturnValue(hookState(1) as never);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemberTicketRecordsTable month="2026-10-01" />
      </QueryClientProvider>
    );

    expect(screen.getByRole("button", { name: "Previous page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeInTheDocument();
  });
});
