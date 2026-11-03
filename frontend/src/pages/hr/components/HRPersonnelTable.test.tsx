import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { DetailedUserReport } from "@/services/reportService";
import { HRPersonnelTable } from "./HRPersonnelTable";

const users: DetailedUserReport[] = [
  {
    user_id: 1,
    username: "alice",
    full_name: "Alice Rossi",
    team: "Core",
    leave_balance: 12,
    overtime: { total_hours: 10, approved_hours: 8, entries: 2 },
    standby: { total_hours: 40, approved_hours: 40, entries: 3 },
    leave: { total_days: 3, approved_days: 3, entries: 1 },
  },
  {
    user_id: 2,
    username: "bob",
    full_name: "Bob Hoxha",
    team: null,
    leave_balance: 5,
    overtime: { total_hours: 30, approved_hours: 30, entries: 4 },
    standby: { total_hours: 0, approved_hours: 0, entries: 0 },
    leave: { total_days: 0, approved_days: 0, entries: 0 },
  },
];

const names = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).queryByText(/Rossi|Hoxha/)?.textContent);

describe("HRPersonnelTable", () => {
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

  it("shows every person with totals and approved amounts", () => {
    render(<HRPersonnelTable users={users} />);
    expect(screen.getByText("Alice Rossi")).toBeInTheDocument();
    expect(screen.getByText("@bob")).toBeInTheDocument();
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
  });

  it("sorts a numeric column highest first, then lowest first", () => {
    render(<HRPersonnelTable users={users} />);
    const sort = screen.getByRole("button", { name: "Sort by overtime" });
    fireEvent.click(sort);
    expect(names()).toEqual(["Bob Hoxha", "Alice Rossi"]);
    fireEvent.click(sort);
    expect(names()).toEqual(["Alice Rossi", "Bob Hoxha"]);
  });

  it("filters by name or username through the table's own search", () => {
    render(<HRPersonnelTable users={users} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "bob" } });
    expect(names()).toEqual(["Bob Hoxha"]);
  });

  it("opens a detail panel for the clicked person without any request", () => {
    render(<HRPersonnelTable users={users} />);
    fireEvent.click(screen.getByText("Alice Rossi"));
    const panel = screen.getByRole("dialog");
    expect(within(panel).getByText("Alice Rossi")).toBeInTheDocument();
    expect(within(panel).getByText("Overtime")).toBeInTheDocument();
    expect(within(panel).getByText("10h (8h approved)")).toBeInTheDocument();
    expect(within(panel).getByText("40h (40h approved)")).toBeInTheDocument();
    expect(within(panel).getByText("3 days (3 approved)")).toBeInTheDocument();
    expect(within(panel).getByText("12 days")).toBeInTheDocument();
  });

  it("shows an empty message when nobody matches", () => {
    render(<HRPersonnelTable users={[]} />);
    expect(screen.getByText("No users found.")).toBeInTheDocument();
  });
});
