import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ApprovalStatusWidget } from "./ApprovalStatusWidget";

vi.mock("@/components/dashboard/ChartCard", () => ({
  ChartCard: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/dashboard/CircularProgress", () => ({
  CircularProgress: ({ percentage, label }: any) => (
    <div data-testid="progress">
      {percentage}-{label}
    </div>
  ),
}));
vi.mock("@/components/dashboard/StatusRow", () => ({
  StatusRow: ({ label, value }: any) => <div data-testid={label}>{value}</div>,
}));

// Canonical 5-element contract produced by computeAdminDashboardSummary.
const REAL_STATUS_DATA = [
  { name: "Pending OT", value: 2 },
  { name: "Pending SB", value: 3 },
  { name: "Pending Leave", value: 1 },
  { name: "Approved", value: 5 },
  { name: "Rejected", value: 1 },
];

describe("ApprovalStatusWidget", () => {
  it("reads the canonical 5-element statusData by name", () => {
    render(<ApprovalStatusWidget statusData={REAL_STATUS_DATA} />);
    expect(screen.getByTestId("Approved")).toHaveTextContent("5");
    // Pending = Pending OT + Pending SB + Pending Leave = 2 + 3 + 1
    expect(screen.getByTestId("Pending")).toHaveTextContent("6");
    expect(screen.getByTestId("Rejected")).toHaveTextContent("1");
  });

  it("computes approved percentage from total", () => {
    // approved=5, pending=6, rejected=1 -> total=12 -> 5/12 = 42%
    render(<ApprovalStatusWidget statusData={REAL_STATUS_DATA} />);
    expect(screen.getByTestId("progress")).toHaveTextContent("42-Approved");
  });

  it("renders zeros when statusData is empty", () => {
    render(<ApprovalStatusWidget statusData={[]} />);
    expect(screen.getByTestId("Approved")).toHaveTextContent("0");
    expect(screen.getByTestId("Pending")).toHaveTextContent("0");
    expect(screen.getByTestId("Rejected")).toHaveTextContent("0");
    expect(screen.getByTestId("progress")).toHaveTextContent("0-Approved");
  });

  it("handles 100% approved", () => {
    render(
      <ApprovalStatusWidget
        statusData={[
          { name: "Pending OT", value: 0 },
          { name: "Pending SB", value: 0 },
          { name: "Pending Leave", value: 0 },
          { name: "Approved", value: 10 },
          { name: "Rejected", value: 0 },
        ]}
      />
    );
    expect(screen.getByTestId("progress")).toHaveTextContent("100-Approved");
  });
});
