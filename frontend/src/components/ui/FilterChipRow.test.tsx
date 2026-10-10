import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FilterChipRow } from "./FilterChipRow";

const options = [
  { value: "a", label: "Alpha", count: 12 },
  { value: "b", label: "Beta" },
  { value: "none", label: "No tech", count: 3, emphasis: "missing" as const },
];

describe("FilterChipRow", () => {
  it("renders a labelled group", () => {
    render(<FilterChipRow label="Tech" options={options} selected={[]} onToggle={vi.fn()} />);
    expect(screen.getByRole("group", { name: "Tech" })).toBeInTheDocument();
  });

  it("marks selected chips aria-pressed", () => {
    render(<FilterChipRow label="Tech" options={options} selected={["a"]} onToggle={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Alpha/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Beta/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("shows counts with tabular-nums", () => {
    render(<FilterChipRow label="Tech" options={options} selected={[]} onToggle={vi.fn()} />);
    expect(screen.getByText("12")).toHaveClass("tabular-nums");
  });

  it("missing emphasis is dashed", () => {
    render(<FilterChipRow label="Tech" options={options} selected={[]} onToggle={vi.fn()} />);
    expect(screen.getByRole("button", { name: /No tech/ })).toHaveClass("border-dashed");
    expect(screen.getByRole("button", { name: /Beta/ })).not.toHaveClass("border-dashed");
  });

  it("onToggle receives the value", () => {
    const onToggle = vi.fn();
    render(<FilterChipRow label="Tech" options={options} selected={[]} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: /Beta/ }));
    expect(onToggle).toHaveBeenCalledWith("b");
  });
});
