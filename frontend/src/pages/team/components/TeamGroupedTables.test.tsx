import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeamGroupedTables } from "./TeamGroupedTables";

describe("TeamGroupedTables", () => {
  it("shows an icon-centered empty state when there are no rows", () => {
    const { container } = render(
      <TeamGroupedTables
        rows={[]}
        columnsBuilder={() => []}
        emptyCopy="No overtime entries match your filters."
        memberGroupMode="none"
        userMetaMap={new Map()}
      />
    );

    expect(screen.getByText("No overtime entries match your filters.")).toBeInTheDocument();

    // Icon-centered EmptyState: decorative icon hidden from assistive tech.
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });
});
