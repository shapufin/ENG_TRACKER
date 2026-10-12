import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeamStatsCards } from "./TeamStatsCards";

describe("TeamStatsCards", () => {
  it("renders the four team counts", () => {
    render(<TeamStatsCards total={5} members={12} noLeader={3} groups={1} />);
    expect(screen.getByText("Total Teams")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Members Assigned")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("No Leader")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Calendar Groups")).toBeInTheDocument();
  });
});
