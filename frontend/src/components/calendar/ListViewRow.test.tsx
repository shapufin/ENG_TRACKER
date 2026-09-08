import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ListViewRow } from "./ListViewRow";
import type { CalendarEvent } from "./types";
import type { User } from "@/types";

const baseEvent: CalendarEvent = {
  id: "1",
  title: "Vacation",
  start: "2024-06-15",
  end: "2024-06-15",
  type: "vacation",
  status: "approved",
  userId: 1,
  userName: "Alice",
  compactLabel: "VAC",
};

const baseUser: User = {
  id: 1,
  username: "alice",
  email: "alice@example.com",
  first_name: "Alice",
  last_name: "Smith",
  full_name: "Alice Smith",
  teams: [{ id: 1, name: "Engineering" }],
} as User;

const typeColors = {
  vacation: "bg-blue-500",
  sick: "bg-red-600",
  standby: "bg-amber-600",
  holiday: "bg-green-500",
};
const statusColors = {
  approved: "border-green-500",
  pending: "border-yellow-500",
  rejected: "border-red-500",
};

const renderRow = (
  eventOverrides: Partial<CalendarEvent> = {},
  user?: User,
  onUserClick?: (userId: number) => void
) =>
  render(
    <table>
      <tbody>
        <ListViewRow
          event={{ ...baseEvent, ...eventOverrides } as CalendarEvent}
          user={user}
          typeColors={typeColors}
          statusColors={statusColors}
          onUserClick={onUserClick}
        />
      </tbody>
    </table>
  );

describe("ListViewRow", () => {
  it("renders a single-day event", () => {
    renderRow();
    expect(screen.getByText("Jun 15, 2024")).toBeInTheDocument();
    expect(screen.getByText("1 day")).toBeInTheDocument();
  });

  it("renders a multi-day event", () => {
    renderRow({ start: "2024-06-15", end: "2024-06-17" });
    expect(screen.getByText("Jun 15 → Jun 17")).toBeInTheDocument();
  });

  it("shows user full name when user is provided", () => {
    renderRow({}, baseUser);
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Engineering")).toBeInTheDocument();
  });

  it("falls back to event userName when user is undefined", () => {
    renderRow({ userName: "Bob" });
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("NO TEAM")).toBeInTheDocument();
  });

  it("falls back to Unknown User when no name is available", () => {
    renderRow({ userName: undefined });
    expect(screen.getByText("Unknown User")).toBeInTheDocument();
  });

  it("calls onUserClick when user button is clicked", () => {
    const onUserClick = vi.fn();
    renderRow({ userId: 1 }, baseUser, onUserClick);
    fireEvent.click(screen.getByText("Alice Smith"));
    expect(onUserClick).toHaveBeenCalledWith(1);
  });

  it("does not call onUserClick when userId is missing", () => {
    const onUserClick = vi.fn();
    renderRow({ userId: undefined }, baseUser, onUserClick);
    fireEvent.click(screen.getByText("Alice Smith"));
    expect(onUserClick).not.toHaveBeenCalled();
  });

  it("renders hours when present", () => {
    renderRow({ hours: 8 });
    expect(screen.getByText("8h logged")).toBeInTheDocument();
  });

  it("renders days when hours are absent", () => {
    renderRow({ hours: undefined, days: 2 });
    expect(screen.getByText("2 day(s)")).toBeInTheDocument();
  });

  it("renders description when present", () => {
    renderRow({ description: "Family trip" });
    expect(screen.getByText("Family trip")).toBeInTheDocument();
  });

  it("renders compactLabel when description is absent", () => {
    renderRow({ description: undefined });
    expect(screen.getByText("VAC")).toBeInTheDocument();
  });

  it("renders status badge with correct status", () => {
    renderRow({ status: "pending" });
    expect(screen.getByText("pending")).toBeInTheDocument();
  });
});
