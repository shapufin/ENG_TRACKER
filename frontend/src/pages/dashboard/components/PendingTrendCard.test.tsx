import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PendingTrendCard } from "./PendingTrendCard";

describe("PendingTrendCard", () => {
  it("renders the title and subtitle", () => {
    render(
      <PendingTrendCard
        data={[
          { date: "2024-06-01", count: 2 },
          { date: "2024-06-02", count: 5 },
        ]}
      />
    );
    expect(screen.getByText("Pending Trend")).toBeInTheDocument();
    expect(screen.getByText(/last 14 days/)).toBeInTheDocument();
  });

  it("renders without data", () => {
    render(<PendingTrendCard />);
    expect(screen.getByText("Pending Trend")).toBeInTheDocument();
  });
});
