import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LeaveFilterBar } from "./LeaveFilterBar";

describe("LeaveFilterBar status chips", () => {
  it("shows a chip per status with counts and selects one on click", () => {
    const onStatusChange = vi.fn();
    render(
      <LeaveFilterBar
        searchQuery=""
        onSearchChange={vi.fn()}
        filterStatus="all"
        onStatusChange={onStatusChange}
        filterType="all"
        onTypeChange={vi.fn()}
        filterUser="all"
        onUserChange={vi.fn()}
        dateFrom=""
        onDateFromChange={vi.fn()}
        dateTo=""
        onDateToChange={vi.fn()}
        statusCounts={{ total: 9, pending: 4, approved: 3, rejected: 2 }}
      />
    );
    const pending = screen.getByRole("button", { name: /pending/i });
    expect(pending).toHaveTextContent("4");
    expect(screen.getByRole("button", { name: /^all/i, pressed: true })).toHaveTextContent("9");
    fireEvent.click(pending);
    expect(onStatusChange).toHaveBeenCalledWith("pending");
  });
});
