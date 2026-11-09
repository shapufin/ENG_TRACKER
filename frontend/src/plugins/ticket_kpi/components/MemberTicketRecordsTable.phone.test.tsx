import React from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { MemberTicketRecordsTable } from "./MemberTicketRecordsTable";
import { useTicketKPITickets } from "../pages/hooks/useTicketKPITickets";

vi.mock("@/hooks/useMediaQuery", () => ({ useMediaQuery: () => true }));
vi.mock("../pages/hooks/useTicketKPITickets", () => ({ useTicketKPITickets: vi.fn() }));

const ticket = {
  id: 1,
  ticket_id: "INC-42",
  title: "VPN down",
  status: "Closed",
  priority: "High",
  category: "",
  assignee: "ana",
  requester: "",
  created_at: null,
  resolved_at: null,
  time_to_resolution_hours: 2.5,
  sla_breached: true,
  raw_data: {},
};

const state = {
  data: { results: [ticket], count: 1 },
  isLoading: false,
  isFetching: false,
  isError: false,
  page: 1,
  setPage: vi.fn(),
  pageSize: 10,
  setPageSize: vi.fn(),
  pageSizeOptions: [10],
  totalPages: 1,
  totalCount: 1,
  filters: {},
  updateFilter: vi.fn(),
  updateDynamicField: vi.fn(),
  resetFilters: vi.fn(),
  availableFields: [],
  filterOptions: {},
};

describe("MemberTicketRecordsTable on phones", () => {
  it("renders each ticket as a card instead of a wide table", () => {
    vi.mocked(useTicketKPITickets).mockReturnValue(state as never);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemberTicketRecordsTable month="2026-11-01" />
      </QueryClientProvider>
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("INC-42")).toBeInTheDocument();
    expect(screen.getByText("VPN down")).toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();
    expect(screen.getByText("Breached")).toBeInTheDocument();
    expect(screen.getByText("2.5h")).toBeInTheDocument();
  });

  it("shows the empty message without a table", () => {
    vi.mocked(useTicketKPITickets).mockReturnValue({
      ...state,
      data: { results: [], count: 0 },
      totalCount: 0,
    } as never);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemberTicketRecordsTable month="2026-11-01" />
      </QueryClientProvider>
    );
    expect(screen.getByText("No ticket records for this month.")).toBeInTheDocument();
  });
});
