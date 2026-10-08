import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { controlSurface } from "./controlSurface";
import { Input } from "./input";
import { Textarea } from "./textarea";
import { Select, SelectTrigger, SelectValue } from "./select";
import { Button } from "./button";

describe("controlSurface recipe", () => {
  it("maps sizes to the height tokens", () => {
    expect(controlSurface({ controlSize: "sm" })).toContain("h-[var(--control-h-sm)]");
    expect(controlSurface({})).toContain("h-[var(--control-h)]");
    expect(controlSurface({ controlSize: "lg" })).toContain("h-[var(--control-h-lg)]");
  });

  it("uses the soft edge + field fill and a ring without offset", () => {
    const c = controlSurface({});
    expect(c).toContain("border-control-edge");
    expect(c).toContain("hover:border-control-edge-hover");
    expect(c).toContain("bg-field-bg");
    expect(c).toContain("focus-visible:ring-focus");
    expect(c).not.toMatch(/ring-offset/);
    expect(c).toContain("touch-manipulation");
    expect(c).toContain("aria-invalid:border-destructive");
  });

  it("area kind uses min-h instead of a fixed height", () => {
    const c = controlSurface({ kind: "area" });
    expect(c).toContain("min-h-24");
    expect(c).not.toContain("h-[var(--control-h)]");
    expect(c).toContain("resize-y");
  });
});

describe("controls consume the recipe", () => {
  it("Input", () => {
    render(<Input aria-label="a" controlSize="sm" />);
    const el = screen.getByLabelText("a");
    expect(el).toHaveClass("h-[var(--control-h-sm)]", "bg-field-bg");
    expect(el.className).not.toMatch(/ring-offset/);
  });

  it("Input still takes the native size attribute", () => {
    render(<Input aria-label="n" size={5} />);
    expect(screen.getByLabelText("n")).toHaveAttribute("size", "5");
  });

  it("Textarea", () => {
    render(<Textarea aria-label="t" />);
    expect(screen.getByLabelText("t")).toHaveClass("min-h-24", "leading-6", "resize-y");
  });

  it("SelectTrigger", () => {
    render(
      <Select>
        <SelectTrigger aria-label="s" controlSize="lg">
          <SelectValue placeholder="x" />
        </SelectTrigger>
      </Select>
    );
    const el = screen.getByRole("combobox", { name: "s" });
    expect(el).toHaveClass("h-[var(--control-h-lg)]", "border-control-edge");
  });

  it("outline Button shares the soft edge; control sizes use tokens", () => {
    render(
      <Button variant="outline" size="control-sm">
        go
      </Button>
    );
    const el = screen.getByRole("button", { name: "go" });
    expect(el).toHaveClass("border-control-edge", "h-[var(--control-h-sm)]");
  });
});
