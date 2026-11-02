import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SkillsLeaderFilters } from "./SkillsLeaderFilters";

describe("SkillsLeaderFilters", () => {
  it("offers the Manager, Line Manager and Tech filters", () => {
    render(
      <SkillsLeaderFilters
        italianTLs={[{ id: 1, name: "Ita Lead" }]}
        albanianTLs={[{ id: 2, name: "Alb Lead" }]}
        techs={[{ id: 3, name: "Network" }]}
        italianTl="all"
        albanianTl="all"
        tech="all"
        onItalianTlChange={vi.fn()}
        onAlbanianTlChange={vi.fn()}
        onTechChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Manager")).toBeInTheDocument();
    expect(screen.getByLabelText("Line Manager")).toBeInTheDocument();
    expect(screen.getByLabelText("Tech")).toBeInTheDocument();
  });
});
