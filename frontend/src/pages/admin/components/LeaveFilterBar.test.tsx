import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LeaveToolbarFilters } from "./LeaveFilterBar";
import { StatusChips } from "./filterBarParts";

describe("Leave status chips", () => {
  it("shows a chip per status with counts and selects one on click", () => {
    const onStatusChange = vi.fn();
    render(
      <StatusChips
        filterStatus="all"
        onStatusChange={onStatusChange}
        counts={{ total: 9, pending: 4, approved: 3, rejected: 2 }}
      />
    );
    const pending = screen.getByRole("button", { name: /pending/i });
    expect(pending).toHaveTextContent("4");
    expect(screen.getByRole("button", { name: /^all/i, pressed: true })).toHaveTextContent("9");
    fireEvent.click(pending);
    expect(onStatusChange).toHaveBeenCalledWith("pending");
  });
});

describe("LeaveToolbarFilters", () => {
  const renderFilters = (onTypeChange = vi.fn()) =>
    render(
      <LeaveToolbarFilters
        searchQuery=""
        onSearchChange={vi.fn()}
        filterType="all"
        onTypeChange={onTypeChange}
        filterUser="all"
        onUserChange={vi.fn()}
        dateFrom=""
        onDateFromChange={vi.fn()}
        dateTo=""
        onDateToChange={vi.fn()}
      />
    );

  it("offers search, type, user and date range as toolbar controls", () => {
    renderFilters();
    expect(screen.getByPlaceholderText("Search by user...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /all types/i, pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /vacation/i, pressed: false })).toBeInTheDocument();
    expect(screen.getByText("All Users")).toBeInTheDocument();
    expect(screen.getByText("Select date range")).toBeInTheDocument();
  });

  it("selects the type filter from visible chips", () => {
    const onTypeChange = vi.fn();
    renderFilters(onTypeChange);
    fireEvent.click(screen.getByRole("button", { name: /vacation/i }));
    expect(onTypeChange).toHaveBeenCalledWith("vacation");
  });
});
