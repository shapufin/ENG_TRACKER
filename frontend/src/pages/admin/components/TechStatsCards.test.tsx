import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TechStatsCards } from "./TechStatsCards";
import type { Tech } from "@/types";

const tech = (id: number, over: Partial<Tech> = {}): Tech => ({
  id,
  name: `T${id}`,
  code: `T${id}`,
  is_active: true,
  levels: [],
  members_count: 0,
  ...over,
});

describe("TechStatsCards", () => {
  it("summarises active techs, levels and assignments", () => {
    render(
      <TechStatsCards
        techs={[
          tech(1, {
            levels: [{ id: 1 }, { id: 2 }, { id: 3 }] as Tech["levels"],
            members_count: 4,
          }),
          tech(2, { members_count: 2 }),
          tech(3, { is_active: false, members_count: 9 }),
        ]}
      />
    );
    expect(screen.getByText("Active techs")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // active techs
    expect(screen.getByText("3")).toBeInTheDocument(); // levels
    expect(screen.getByText("15")).toBeInTheDocument(); // assignments across all techs
    expect(screen.getByText("of 3 total")).toBeInTheDocument();
  });
});
