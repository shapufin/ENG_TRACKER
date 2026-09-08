import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AnalyticsFilters } from "./AnalyticsFilters";
import type { TeamOption, UserOption } from "./types";

const teams: TeamOption[] = [
  { id: 1, name: "Alpha Team" },
  { id: 2, name: "Beta Team" },
];

const users: UserOption[] = [
  { id: 1, username: "jdoe", full_name: "John Doe" },
  { id: 2, username: "asmith", full_name: "Alice Smith" },
];

const baseProps = {
  show: true,
  teams,
  users,
  selectedTeams: [],
  onTeamsChange: vi.fn(),
  selectedUsers: [],
  onUsersChange: vi.fn(),
  selectedCategories: [],
  onCategoryToggle: vi.fn(),
  selectedStatuses: [],
  onStatusToggle: vi.fn(),
  onClear: vi.fn(),
  onClose: vi.fn(),
};

describe("AnalyticsFilters", () => {
  it("renders nothing when show is false", () => {
    const { container } = render(<AnalyticsFilters {...baseProps} show={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders team and user filter comboboxes", () => {
    render(<AnalyticsFilters {...baseProps} />);
    expect(screen.getByText("Teams")).toBeInTheDocument();
    expect(screen.getByText("Users")).toBeInTheDocument();
    expect(screen.getByText("All teams")).toBeInTheDocument();
    expect(screen.getByText("All users")).toBeInTheDocument();
  });

  it("renders category toggle buttons", () => {
    render(<AnalyticsFilters {...baseProps} />);
    expect(screen.getByText("overtime")).toBeInTheDocument();
    expect(screen.getByText("standby")).toBeInTheDocument();
    expect(screen.getByText("leave")).toBeInTheDocument();
  });

  it("renders status toggle buttons", () => {
    render(<AnalyticsFilters {...baseProps} />);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(screen.getByText("rejected")).toBeInTheDocument();
  });

  it("calls onCategoryToggle when clicking a category", () => {
    render(<AnalyticsFilters {...baseProps} />);
    fireEvent.click(screen.getByText("overtime"));
    expect(baseProps.onCategoryToggle).toHaveBeenCalledWith("overtime", true);
  });

  it("calls onStatusToggle when clicking a status", () => {
    render(<AnalyticsFilters {...baseProps} />);
    fireEvent.click(screen.getByText("approved"));
    expect(baseProps.onStatusToggle).toHaveBeenCalledWith("approved", true);
  });

  it("calls onClear when clicking Clear All", () => {
    render(<AnalyticsFilters {...baseProps} />);
    fireEvent.click(screen.getByText("Clear All"));
    expect(baseProps.onClear).toHaveBeenCalled();
  });

  it("calls onClose when clicking Close", () => {
    render(<AnalyticsFilters {...baseProps} />);
    fireEvent.click(screen.getByText("Close"));
    expect(baseProps.onClose).toHaveBeenCalled();
  });

  it("opens team combobox and shows team options", () => {
    render(<AnalyticsFilters {...baseProps} />);
    // Click the teams combobox trigger (the "All teams" button)
    fireEvent.click(screen.getByText("All teams"));
    expect(screen.getByText("Alpha Team")).toBeInTheDocument();
    expect(screen.getByText("Beta Team")).toBeInTheDocument();
  });

  it("opens user combobox and shows user labels", () => {
    render(<AnalyticsFilters {...baseProps} />);
    fireEvent.click(screen.getByText("All users"));
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
  });
});
