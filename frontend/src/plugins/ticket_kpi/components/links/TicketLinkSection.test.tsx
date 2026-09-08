import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TicketLinkSection } from "./TicketLinkSection";

const mockHook = vi.fn();

vi.mock("../../pages/hooks/useTicketLink", () => ({
  useTicketLink: (...args: unknown[]) => mockHook(...args),
}));

describe("TicketLinkSection", () => {
  beforeEach(() => {
    mockHook.mockReturnValue({
      query: "",
      setQuery: vi.fn(),
      links: [],
      searchResults: [],
      isLoading: false,
      isSearching: false,
      createLink: vi.fn(),
      deleteLink: vi.fn(),
      isCreating: false,
      isDeleting: false,
    });
  });

  it("renders the search field and empty state", () => {
    render(<TicketLinkSection overtimeLogId={7} />);
    expect(screen.getByLabelText("Search KPI tickets")).toBeInTheDocument();
    expect(screen.getByText("No KPI tickets linked yet.")).toBeInTheDocument();
  });

  it("renders results and creates a link when selected", () => {
    const createLink = vi.fn();
    mockHook.mockReturnValue({
      query: "INC",
      setQuery: vi.fn(),
      links: [],
      searchResults: [
        {
          id: 4,
          ticket_id: "INC-4",
          title: "VPN issue",
          status: "closed",
          batch_month: "2026-03-01",
        },
      ],
      isLoading: false,
      isSearching: false,
      createLink,
      deleteLink: vi.fn(),
      isCreating: false,
      isDeleting: false,
    });

    render(<TicketLinkSection overtimeLogId={7} />);
    fireEvent.click(screen.getByText("INC-4"));
    expect(createLink).toHaveBeenCalledWith(4);
  });

  it("renders existing links and deletes one", () => {
    const deleteLink = vi.fn();
    mockHook.mockReturnValue({
      query: "",
      setQuery: vi.fn(),
      links: [
        {
          id: 8,
          ticket_id: "INC-8",
          ticket_title: "Printer issue",
        },
      ],
      searchResults: [],
      isLoading: false,
      isSearching: false,
      createLink: vi.fn(),
      deleteLink,
      isCreating: false,
      isDeleting: false,
    });

    render(<TicketLinkSection overtimeLogId={7} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove link INC-8" }));
    expect(deleteLink).toHaveBeenCalledWith(8);
  });
});
