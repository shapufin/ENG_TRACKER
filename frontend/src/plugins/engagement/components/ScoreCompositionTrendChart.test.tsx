import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScoreCompositionTrendChart } from "./ScoreCompositionTrendChart";
import type { EngagementTrendPoint } from "../types/engagement";

const point = (overrides: Partial<EngagementTrendPoint> = {}): EngagementTrendPoint => ({
  month: "2026-09",
  engagement_score: 78,
  avg_tta_hours: 6,
  decisions_during_leave: 0,
  score_speed: 90,
  score_approval_rate: 90,
  score_activity: 60,
  score_consistency: 80,
  ...overrides,
});

describe("ScoreCompositionTrendChart", () => {
  it("renders an empty state when every sub-score is null across the trend", () => {
    render(
      <ScoreCompositionTrendChart
        data={[
          point({
            score_speed: null,
            score_approval_rate: null,
            score_activity: null,
            score_consistency: null,
          }),
        ]}
      />
    );
    expect(screen.getByText("No score history yet")).toBeInTheDocument();
  });

  it("renders the chart instead of the empty state when data is present", () => {
    render(<ScoreCompositionTrendChart data={[point()]} />);
    expect(screen.queryByText("No score history yet")).not.toBeInTheDocument();
  });
});
