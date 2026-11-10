import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DescriptionColumn } from "./DescriptionColumn";

describe("DescriptionColumn", () => {
  it("renders the value inside an interactive trigger button", () => {
    render(<DescriptionColumn value="Night shift cover" />);
    expect(screen.getByRole("button", { name: "Night shift cover" })).toBeInTheDocument();
  });

  it("renders a dash without an interactive trigger for empty values", () => {
    const { rerender } = render(<DescriptionColumn value={null} />);
    expect(screen.getByText("-")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(<DescriptionColumn value={undefined} />);
    expect(screen.getByText("-")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("truncates at max-width (needs a block-level display for max-w to apply)", () => {
    // Regression: an inline <span> ignores max-width, so long text bled into
    // the next cell instead of ellipsizing (overtime description over status).
    const { container } = render(
      <DescriptionColumn value="E2E seeded Sept record (pre-finalize)" />
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain("truncate");
    expect(el.className).toContain("max-w-52");
    expect(el.className).toMatch(/(^|\s)(block|inline-block)(\s|$)/);
  });

  it("reveals full text in a tooltip on focus/hover and a popover on click without bubbling to row click", () => {
    const longText =
      "Emergency midnight database failover and incident triage with client ops team until service restored";
    const onRowClick = vi.fn();

    render(
      <div onClick={onRowClick}>
        <DescriptionColumn value={longText} />
      </div>
    );

    const trigger = screen.getByRole("button", { name: longText });
    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip")).toHaveTextContent(longText);

    fireEvent.click(trigger);
    expect(onRowClick).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent(longText);
  });
});
