import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
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
  beforeEach(() => {
    // DataTable observes its scroll container; JSDOM has no ResizeObserver.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      }
    );
  });

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

  it("sorts by days when the Days header is clicked", () => {
    render(
      <HRLeaveTable
        leaves={[
          { ...leaves[0], id: 1, user_full_name: "Alice Smith", days_requested: 5 },
          { ...leaves[0], id: 2, user_full_name: "Bob Hoxha", days_requested: 2 },
        ]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /days/i }));
    const first = () => within(screen.getAllByRole("row")[1]);
    const before = first().queryByText(/Alice|Bob/)?.textContent;
    fireEvent.click(screen.getByRole("button", { name: /days/i }));
    expect(first().queryByText(/Alice|Bob/)?.textContent).not.toBe(before);
  });
});
