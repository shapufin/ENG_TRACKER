import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HRReportStatusCard } from "./HRReportStatusCard";

describe("HRReportStatusCard", () => {
  it("shows coverage as distinct teams represented over total teams", () => {
    const leaders = [
      { id: 1, rank: 1, name: "A", team_name: "SIAE_TEAM", total_hours: 10 },
      { id: 2, rank: 2, name: "B", team_name: "MSC_TEAM", total_hours: 5 },
      { id: 3, rank: 3, name: "C", team_name: "SIAE_TEAM", total_hours: 2 },
    ];
    const teams = [
      { id: 1, name: "SIAE_TEAM" },
      { id: 2, name: "MSC_TEAM" },
      { id: 3, name: "E2E_TEAM" },
      { id: 4, name: "OTHER_TEAM" },
    ];
    render(<HRReportStatusCard leaders={leaders} teams={teams} />);
    expect(screen.getByText("2 / 4 teams")).toBeInTheDocument();
  });

  it("handles no teams without dividing by zero", () => {
    render(<HRReportStatusCard leaders={[]} teams={[]} />);
    expect(screen.getByText("0 / 0 teams")).toBeInTheDocument();
  });

  it("ignores a leader team_name that isn't a known team, instead of over-counting", () => {
    const leaders = [
      { id: 1, rank: 1, name: "A", team_name: "SIAE_TEAM", total_hours: 10 },
      { id: 2, rank: 2, name: "B", team_name: "STALE_RENAMED_TEAM", total_hours: 5 },
    ];
    const teams = [
      { id: 1, name: "SIAE_TEAM" },
      { id: 2, name: "MSC_TEAM" },
    ];
    render(<HRReportStatusCard leaders={leaders} teams={teams} />);
    expect(screen.getByText("1 / 2 teams")).toBeInTheDocument();
  });
});
