import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HRLeaveTable } from "./HRLeaveTable";

const leaves = [
  {
    id: 1,
    user_full_name: "Alice Smith",
    request_type_display: "Vacation",
    start_date: "2024-06-15",
    end_date: "2024-06-20",
    days_requested: 5,
    status: "approved" as const,
    status_display: "Approved",
  },
];

describe("HRLeaveTable", () => {
  it("renders empty state", () => {
    render(<HRLeaveTable leaves={[]} />);
    expect(screen.getByText("No leave requests found.")).toBeInTheDocument();
  });

  it("renders leave rows", () => {
    render(<HRLeaveTable leaves={leaves} />);
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Vacation")).toBeInTheDocument();
    expect(screen.getByText("15/06/2024 - 20/06/2024")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("falls back to user_name when full name missing", () => {
    render(
      <HRLeaveTable leaves={[{ ...leaves[0], user_full_name: undefined, user_name: "alice" }]} />
    );
    expect(screen.getByText("alice")).toBeInTheDocument();
  });

  it("falls back to Unknown when no user name", () => {
    render(
      <HRLeaveTable leaves={[{ ...leaves[0], user_full_name: undefined, user_name: undefined }]} />
    );
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });
});
