import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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

  it("renders nothing extra for an empty list", () => {
    render(<HRTeamLeaderBarList leaders={[]} />);
    expect(screen.getByText("Overtime by Team Leader")).toBeInTheDocument();
  });
});
