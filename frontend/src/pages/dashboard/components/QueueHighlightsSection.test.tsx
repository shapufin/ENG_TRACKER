import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueueHighlightsSection } from "./QueueHighlightsSection";

// DataTable (TanStack) needs ResizeObserver, which jsdom lacks.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const highlights = [
  {
    id: 1,
    type: "overtime",
    userName: "Alice Smith",
    date: "2024-06-01",
    details: "4h - fix",
    status: "pending",
    tag: "OT",
    hours: 4,
    days: null,
  },
  {
    id: 2,
    type: "leave",
    userName: "Bob Jones",
    date: "2024-06-02",
    details: "1d vacation",
    status: "pending",
    tag: "VACATION",
    hours: null,
    days: 1,
  },
];

const typeCounts = { all: 2, overtime: 1, standby: 0, leave: 1 };

const baseProps = {
  highlights,
  isLoading: false,
  isError: false,
  typeCounts,
  filter: "all" as const,
  onFilterChange: vi.fn(),
  sort: "recent" as const,
  onSortChange: vi.fn(),
  onBatchApprove: vi.fn(),
  isBatchApproving: false,
  onApproveOne: vi.fn(),
  onRejectOne: vi.fn(),
};

describe("QueueHighlightsSection", () => {
  const renderSection = (props = {}) =>
    render(
      <MemoryRouter>
        <QueueHighlightsSection {...baseProps} {...props} />
      </MemoryRouter>
    );

  it("renders the title, action badge, and subtitle", () => {
    renderSection();
    expect(screen.getByText("Queue Highlights")).toBeInTheDocument();
    expect(screen.getByText("Action Required")).toBeInTheDocument();
    expect(
      screen.getByText("Review and resolve time-sensitive operational items")
    ).toBeInTheDocument();
  });

  it("marks the active filter chip with aria-pressed", () => {
    renderSection();
    expect(screen.getByText("All (2)").closest("button")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Leave (1)").closest("button")).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("renders hours and days effort values", () => {
    renderSection();
    expect(screen.getByText("4.00h")).toBeInTheDocument();
    expect(screen.getByText("1d")).toBeInTheDocument();
  });

  it("renders filter chips with counts", () => {
    renderSection();
    expect(screen.getByText("All (2)")).toBeInTheDocument();
    expect(screen.getByText("Standby (0)")).toBeInTheDocument();
    expect(screen.getByText("Leave (1)")).toBeInTheDocument();
    expect(screen.getByText("OT (1)")).toBeInTheDocument();
  });

  it("calls onFilterChange when a chip is clicked", () => {
    const onFilterChange = vi.fn();
    renderSection({ onFilterChange });
    screen.getByText("Leave (1)").click();
    expect(onFilterChange).toHaveBeenCalledWith("leave");
  });

  it("renders a tag pill per highlight", () => {
    renderSection();
    expect(screen.getByText("OT")).toBeInTheDocument();
    expect(screen.getByText("VACATION")).toBeInTheDocument();
  });

  it("calls onApproveOne/onRejectOne for a specific item", () => {
    const onApproveOne = vi.fn();
    const onRejectOne = vi.fn();
    renderSection({ onApproveOne, onRejectOne });
    const approveButtons = screen.getAllByText("Approve");
    approveButtons[0].click();
    expect(onApproveOne).toHaveBeenCalledWith(1, "overtime");

    const rejectButtons = screen.getAllByText("Reject");
    rejectButtons[1].click();
    expect(onRejectOne).toHaveBeenCalledWith(2, "leave");
  });

  it("calls onBatchApprove and disables the button while approving", () => {
    const onBatchApprove = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <QueueHighlightsSection {...baseProps} onBatchApprove={onBatchApprove} />
      </MemoryRouter>
    );
    screen.getByRole("button", { name: "Batch Approve" }).click();
    expect(onBatchApprove).toHaveBeenCalled();

    rerender(
      <MemoryRouter>
        <QueueHighlightsSection {...baseProps} isBatchApproving />
      </MemoryRouter>
    );
    expect(screen.getByRole("button", { name: "Approving…" })).toBeDisabled();
  });

  it("disables Batch Approve when there are no visible highlights", () => {
    renderSection({ highlights: [] });
    expect(screen.getByRole("button", { name: "Batch Approve" })).toBeDisabled();
  });

  it("disables the per-item button while that item is approving", () => {
    renderSection({ approvingIds: new Set(["overtime-1"]) });
    const buttons = screen.getAllByRole("button", { name: "Approving…" });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toBeDisabled();
  });

  it("locks both buttons while either mutation is pending for the row", () => {
    renderSection({ rejectingId: "overtime-1" });
    expect(screen.getByRole("button", { name: "Rejecting…" })).toBeDisabled();
    // Approve on the same row must also lock — no double decisions.
    const approveButtons = screen.getAllByRole("button", { name: "Approve" });
    const rowApprove = approveButtons.find((btn) =>
      (btn as HTMLElement).closest("tr")?.textContent?.includes("Alice Smith")
    );
    expect(rowApprove).toBeDisabled();
  });

  it("tracks multiple concurrently-approving items independently, without disabling others", () => {
    renderSection({ approvingIds: new Set(["overtime-1", "leave-2"]) });
    const buttons = screen.getAllByRole("button", { name: "Approving…" });
    expect(buttons).toHaveLength(2);
  });

  it("renders table headers for employee, type, duration, date, details, status, actions", () => {
    renderSection();
    for (const header of [
      "Employee",
      "Type",
      "Duration",
      "Requested",
      "Details",
      "Status",
      "Actions",
    ]) {
      expect(screen.getByText(header)).toBeInTheDocument();
    }
  });

  it("paginates at five rows per page", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      id: 10 + i,
      type: "overtime",
      userName: `User ${i}`,
      date: "2024-06-01",
      details: `${i}h - work`,
      status: "pending",
      tag: "OT",
      hours: i,
      days: null,
    }));
    renderSection({ highlights: many });
    expect(screen.getByText("User 0")).toBeInTheDocument();
    expect(screen.queryByText("User 5")).not.toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("User 5")).toBeInTheDocument();
    expect(screen.queryByText("User 0")).not.toBeInTheDocument();
  });
});
