import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RecordDetailModal } from "./RecordDetailModal";

vi.mock("@/lib/date-format-utils", () => ({
  formatDateDDMMYYYY: () => "01/01/2024",
  formatDateTime: () => "01/01/2024 00:00",
}));

const overtimeRecord = {
  id: 1,
  user_name: "Alice",
  user_full_name: "Alice A",
  status: "approved",
  date: "2024-01-01",
  start_time: "09:00",
  end_time: "17:00",
  hours: 8,
  client_name: "C1",
  description: "Work",
  evidence_type: "ticket",
  evidence: "E1",
  reference_code: "R1",
  ticket_references: ["INC-001", "INC-002"],
  approved_by_name: "Bob",
  approved_at: "2024-01-02",
  rejection_reason: "",
} as any;
const standbyRecord = {
  id: 2,
  user_name: "Bob",
  status: "rejected",
  date: "2024-01-01",
  start_time: "09:00",
  end_time: "17:00",
  hours: 8,
  pattern_name: "P1",
  description: "Standby",
  evidence: "E1",
  approved_by_name: "Alice",
  approved_at: "2024-01-02",
  rejection_reason: "No need",
} as any;
const leaveRecord = {
  id: 3,
  user_name: "Charlie",
  status: "pending",
  start_date: "2024-01-01",
  end_date: "2024-01-02",
  days_requested: 2,
  request_type: "vacation",
  request_type_display: "Vacation",
  reason: "Holiday",
  user_leave_balance: 5,
  approved_by_name: "",
  approved_at: null,
  rejection_reason: "",
} as any;

describe("RecordDetailModal", () => {
  it("returns null when no record", () => {
    const { container } = render(
      <RecordDetailModal open={true} onOpenChange={vi.fn()} record={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders overtime record", () => {
    render(<RecordDetailModal open={true} onOpenChange={vi.fn()} record={overtimeRecord} />);
    expect(screen.getByRole("heading", { name: "Overtime" })).toBeInTheDocument();
    expect(screen.getByText("Alice A")).toBeInTheDocument();
    expect(screen.getByText("C1")).toBeInTheDocument();
  });

  it("shows ticket references for ticket-type overtime", () => {
    render(<RecordDetailModal open={true} onOpenChange={vi.fn()} record={overtimeRecord} />);
    expect(screen.getByText("Ticket References")).toBeInTheDocument();
    expect(screen.getByText("INC-001, INC-002")).toBeInTheDocument();
    expect(screen.getByText("Evidence")).toBeInTheDocument();
    expect(screen.getByText("E1")).toBeInTheDocument();
    expect(screen.getByText("Reference Code")).toBeInTheDocument();
    expect(screen.getByText("R1")).toBeInTheDocument();
  });

  it("shows evidence field for non-ticket-type overtime", () => {
    const emailRecord = { ...overtimeRecord, evidence_type: "email" } as any;
    render(<RecordDetailModal open={true} onOpenChange={vi.fn()} record={emailRecord} />);
    expect(screen.getByText("Evidence")).toBeInTheDocument();
    expect(screen.getByText("E1")).toBeInTheDocument();
    expect(screen.queryByText("Ticket References")).not.toBeInTheDocument();
  });

  it("renders standby record", () => {
    render(<RecordDetailModal open={true} onOpenChange={vi.fn()} record={standbyRecord} />);
    expect(screen.getByRole("heading", { name: "Standby" })).toBeInTheDocument();
    expect(screen.getByText("No need")).toBeInTheDocument();
  });

  it("renders leave record", () => {
    render(<RecordDetailModal open={true} onOpenChange={vi.fn()} record={leaveRecord} />);
    expect(screen.getByRole("heading", { name: "Vacation" })).toBeInTheDocument();
    expect(screen.getByText("Holiday")).toBeInTheDocument();
  });

  it("calls onOpenChange when close clicked", () => {
    const onOpenChange = vi.fn();
    render(<RecordDetailModal open={true} onOpenChange={onOpenChange} record={overtimeRecord} />);
    // The dialog uses hideClose, so its own header close is the only one.
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
