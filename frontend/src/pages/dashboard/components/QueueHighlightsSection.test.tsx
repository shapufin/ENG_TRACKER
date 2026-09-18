import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueueHighlightsSection } from "./QueueHighlightsSection";

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
  it("renders filter chips with counts", () => {
    render(<QueueHighlightsSection {...baseProps} />);
    expect(screen.getByText("All (2)")).toBeInTheDocument();
    expect(screen.getByText("Standby (0)")).toBeInTheDocument();
    expect(screen.getByText("Leave (1)")).toBeInTheDocument();
    expect(screen.getByText("OT (1)")).toBeInTheDocument();
  });

  it("calls onFilterChange when a chip is clicked", () => {
    const onFilterChange = vi.fn();
    render(<QueueHighlightsSection {...baseProps} onFilterChange={onFilterChange} />);
    screen.getByText("Leave (1)").click();
    expect(onFilterChange).toHaveBeenCalledWith("leave");
  });

  it("renders a tag pill per highlight", () => {
    render(<QueueHighlightsSection {...baseProps} />);
    expect(screen.getByText("OT")).toBeInTheDocument();
    expect(screen.getByText("VACATION")).toBeInTheDocument();
  });

  it("calls onApproveOne/onRejectOne for a specific item", () => {
    const onApproveOne = vi.fn();
    const onRejectOne = vi.fn();
    render(
      <QueueHighlightsSection {...baseProps} onApproveOne={onApproveOne} onRejectOne={onRejectOne} />
    );
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
      <QueueHighlightsSection {...baseProps} onBatchApprove={onBatchApprove} />
    );
    const button = screen.getByText("Batch Approve");
    button.click();
    expect(onBatchApprove).toHaveBeenCalled();

    rerender(<QueueHighlightsSection {...baseProps} isBatchApproving />);
    expect(screen.getByText("Batch Approve").closest("button")).toBeDisabled();
  });

  it("disables Batch Approve when there are no visible highlights", () => {
    render(<QueueHighlightsSection {...baseProps} highlights={[]} />);
    expect(screen.getByText("Batch Approve").closest("button")).toBeDisabled();
  });
});
