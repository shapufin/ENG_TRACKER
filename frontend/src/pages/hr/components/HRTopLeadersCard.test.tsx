import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HRTopLeadersCard } from "./HRTopLeadersCard";

const leaders = [
  { id: 2, rank: 1, name: "Andrea Negro", team_name: "MSC_TEAM", total_hours: 279 },
  { id: 1, rank: 2, name: "Andrea Mussetta", team_name: null, total_hours: 54.5 },
];

describe("HRTopLeadersCard", () => {
  it("lists ranked leaders with team and hours", () => {
    render(<HRTopLeadersCard leaders={leaders} />);
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("MSC_TEAM")).toBeInTheDocument();
    expect(screen.getByText("No Team")).toBeInTheDocument();
    expect(screen.getByText("279.0h")).toBeInTheDocument();
  });

  it("selects a leader from their row", () => {
    const onSelect = vi.fn();
    render(<HRTopLeadersCard leaders={leaders} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Andrea Mussetta/ }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("marks the selected leader as pressed", () => {
    render(<HRTopLeadersCard leaders={leaders} onSelect={vi.fn()} selectedId={2} />);
    expect(screen.getByRole("button", { name: /Andrea Negro/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("stays plain text when no handler is given", () => {
    render(<HRTopLeadersCard leaders={leaders} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
