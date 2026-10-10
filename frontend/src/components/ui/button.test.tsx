import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "./button";

describe("Button component", () => {
  it("should render button with text", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText("Click me")).toBeInTheDocument();
  });

  it("should render disabled button", () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByText("Disabled")).toBeDisabled();
  });

  it("should handle click events", () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    screen.getByText("Click").click();
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});

describe("Button control-icon-sm", () => {
  it("produces equal height/width token classes", () => {
    render(
      <Button size="control-icon-sm" aria-label="x">
        i
      </Button>
    );
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("h-[var(--control-h-sm)]");
    expect(cls).toContain("w-[var(--control-h-sm)]");
  });
});
