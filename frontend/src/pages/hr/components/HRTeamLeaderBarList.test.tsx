import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HRTeamLeaderBarList } from "./HRTeamLeaderBarList";

const leaders = [
  { id: 1, rank: 2, name: "Andrea Mussetta", team_name: "E2E_TEAM", total_hours: 54.5 },
  { id: 2, rank: 1, name: "Andrea Negro", team_name: "MSC_TEAM", total_hours: 279 },
  { id: 3, rank: 3, name: "Enri Demnushi", team_name: "SIAE_TEAM", total_hours: 7 },
];

describe("HRTeamLeaderBarList", () => {
  it("renders leaders sorted by hours descending", () => {
    render(<HRTeamLeaderBarList leaders={leaders} />);
    const names = screen.getAllByText(/Andrea|Enri/).map((el) => el.textContent);
    expect(names[0]).toBe("Andrea Negro");
    expect(names[names.length - 1]).toBe("Enri Demnushi");
  });

  it("renders each leader's hours", () => {
    render(<HRTeamLeaderBarList leaders={leaders} />);
    expect(screen.getByText("279.0h")).toBeInTheDocument();
    expect(screen.getByText("54.5h")).toBeInTheDocument();
    expect(screen.getByText("7.0h")).toBeInTheDocument();
  });

  it("prints each leader's share of the total hours", () => {
    render(<HRTeamLeaderBarList leaders={leaders} />);
    // 279 / 340.5 = 82%, 54.5 / 340.5 = 16%, 7 / 340.5 = 2%
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText("16%")).toBeInTheDocument();
    expect(screen.getByText("2%")).toBeInTheDocument();
  });

  it("renders nothing extra for an empty list", () => {
    render(<HRTeamLeaderBarList leaders={[]} />);
    expect(screen.getByText("Hours by Team Leader")).toBeInTheDocument();
  });

  it("selects a leader when their bar is clicked", () => {
    const onSelect = vi.fn();
    render(<HRTeamLeaderBarList leaders={leaders} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Andrea Negro/ }));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("marks the selected leader as pressed", () => {
    render(<HRTeamLeaderBarList leaders={leaders} onSelect={vi.fn()} selectedId={3} />);
    expect(screen.getByRole("button", { name: /Enri Demnushi/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: /Andrea Negro/ })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("stays plain text when no handler is given", () => {
    render(<HRTeamLeaderBarList leaders={leaders} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
