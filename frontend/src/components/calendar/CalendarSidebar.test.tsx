import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CalendarSidebar } from "./CalendarSidebar";
import type { User } from "@/types";

vi.mock("./CollapsedCalendarSidebar", () => ({
  CollapsedCalendarSidebar: () => <div data-testid="collapsed-sidebar" />,
}));
vi.mock("./CalendarSidebarFooter", () => ({
  CalendarSidebarFooter: ({ onToggleExpanded }: { onToggleExpanded: () => void }) => (
    <button onClick={onToggleExpanded}>Expand</button>
  ),
}));
vi.mock("./UserAvatar", () => ({ UserAvatar: () => <span data-testid="avatar" /> }));

const users: User[] = [
  {
    id: 1,
    username: "alice",
    first_name: "Alice",
    last_name: "Smith",
    full_name: "Alice Smith",
    email: "alice@example.com",
  } as User,
  {
    id: 2,
    username: "bob",
    first_name: "Bob",
    last_name: "Jones",
    full_name: "Bob Jones",
    email: "bob@example.com",
  } as User,
];

const baseProps = {
  allUsers: users,
  visibleUsers: new Set([1]),
  onToggleUser: vi.fn(),
  onClearUsers: vi.fn(),
  showStandby: true,
  showVacation: true,
  showSick: true,
  onToggleType: vi.fn(),
  calendarGroup: "Engineering",
  onShowUserModal: vi.fn(),
  collapsed: false,
  onToggleCollapse: vi.fn(),
};

describe("CalendarSidebar", () => {
  it("renders expanded sidebar", () => {
    render(<CalendarSidebar {...baseProps} />);
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
  });

  it("renders collapsed sidebar", () => {
    render(<CalendarSidebar {...baseProps} collapsed={true} />);
    expect(screen.getByTestId("collapsed-sidebar")).toBeInTheDocument();
  });

  it("filters users by query", () => {
    render(<CalendarSidebar {...baseProps} />);
    const input = screen.getByPlaceholderText("Search member...");
    fireEvent.change(input, { target: { value: "alice" } });
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.queryByText("Bob Jones")).not.toBeInTheDocument();
  });

  it("clears users via header", () => {
    render(<CalendarSidebar {...baseProps} />);
    fireEvent.click(screen.getByText("All members"));
    expect(baseProps.onClearUsers).toHaveBeenCalled();
  });

  it("toggles expanded via footer", () => {
    render(<CalendarSidebar {...baseProps} />);
    fireEvent.click(screen.getByText("Expand"));
  });

  it("shows per-member remaining days when the balance map has the user", () => {
    render(<CalendarSidebar {...baseProps} remainingDaysByUser={new Map([[1, 14]])} />);
    expect(screen.getByText("14d remaining")).toBeInTheDocument();
    expect(screen.queryByText("18d remaining")).not.toBeInTheDocument();
  });

  it("hides per-member remaining days without the balance map", () => {
    render(<CalendarSidebar {...baseProps} />);
    expect(screen.queryByText(/d remaining/)).not.toBeInTheDocument();
  });
});
