import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DescriptionColumn } from "./DescriptionColumn";

describe("DescriptionColumn", () => {
  it("renders the value", () => {
    render(<DescriptionColumn value="Night shift cover" />);
    expect(screen.getByText("Night shift cover")).toBeInTheDocument();
  });

  it("renders a dash for empty values", () => {
    const { rerender } = render(<DescriptionColumn value={null} />);
    expect(screen.getByText("-")).toBeInTheDocument();
    rerender(<DescriptionColumn value={undefined} />);
    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("truncates at max-width (needs a block-level display for max-w to apply)", () => {
    // Regression: an inline <span> ignores max-width, so long text bled into
    // the next cell instead of ellipsizing (overtime description over status).
    const { container } = render(
      <DescriptionColumn value="E2E seeded Sept record (pre-finalize)" />
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain("truncate");
    expect(el.className).toContain("max-w-[200px]");
    expect(el.className).toMatch(/(^|\s)(block|inline-block)(\s|$)/);
  });
});
