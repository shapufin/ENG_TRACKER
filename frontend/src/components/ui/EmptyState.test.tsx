import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Sparkles, Plus } from "lucide-react";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders the icon, title, and description", () => {
    const { container } = render(
      <EmptyState
        icon={Sparkles}
        title="No skills here yet"
        description="Add your first skill to start building this category."
      />
    );

    expect(screen.getByText("No skills here yet")).toBeInTheDocument();
    expect(
      screen.getByText("Add your first skill to start building this category.")
    ).toBeInTheDocument();

    // The decorative icon renders inside the muted circle and is hidden
    // from assistive technology (the title carries the meaning).
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("renders no CTA when the action slot is omitted", () => {
    render(<EmptyState icon={Sparkles} title="Nothing here" />);

    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders the CTA action and fires its click handler", () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        icon={Sparkles}
        title="No skills here yet"
        action={
          <button type="button" onClick={onClick}>
            <Plus aria-hidden="true" /> Add skill
          </button>
        }
      />
    );

    const cta = screen.getByRole("button", { name: /add skill/i });
    fireEvent.click(cta);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
