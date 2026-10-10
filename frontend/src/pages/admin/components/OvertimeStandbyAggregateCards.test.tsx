import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OvertimeAggregateCard } from "./OvertimeAggregateCard";
import { StandbyAggregateCard } from "./StandbyAggregateCard";

const data = { total_hours: 12.5, approved_hours: 8, total_entries: 4, pending_count: 3 };

describe("OvertimeAggregateCard", () => {
  it("shows total, approved and pending figures as stat cards", () => {
    render(<OvertimeAggregateCard {...data} />);
    expect(screen.getByText("Total Hours Generated")).toBeInTheDocument();
    expect(screen.getByText("12.5")).toBeInTheDocument();
    expect(screen.getByText("Successfully Approved")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/4 logs/)).toBeInTheDocument();
  });
});

describe("StandbyAggregateCard", () => {
  it("shows total, approved and pending figures as stat cards", () => {
    render(<StandbyAggregateCard {...data} />);
    expect(screen.getByText("Total Hours Logged")).toBeInTheDocument();
    expect(screen.getByText("Verified & Approved")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText(/4 logs/)).toBeInTheDocument();
  });
});
