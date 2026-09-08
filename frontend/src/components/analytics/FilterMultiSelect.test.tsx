import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterMultiSelect, type FilterOption } from "./FilterMultiSelect";

const options: FilterOption[] = [
  { id: 1, label: "Alpha Team", sublabel: "ALPHA" },
  { id: 2, label: "Beta Team", sublabel: "BETA" },
  { id: 3, label: "Gamma Team", sublabel: "GAMMA" },
];

describe("FilterMultiSelect", () => {
  it("shows placeholder when nothing selected", () => {
    render(
      <FilterMultiSelect options={options} value={[]} onChange={vi.fn()} placeholder="All teams" />
    );
    expect(screen.getByText("All teams")).toBeInTheDocument();
  });

  it("shows single selected label", () => {
    render(
      <FilterMultiSelect
        options={options}
        value={["1"]}
        onChange={vi.fn()}
        placeholder="All teams"
      />
    );
    // Label appears in trigger button AND badge — use getAllByText
    expect(screen.getAllByText("Alpha Team").length).toBeGreaterThanOrEqual(1);
  });

  it("shows count when multiple selected", () => {
    render(
      <FilterMultiSelect
        options={options}
        value={["1", "2"]}
        onChange={vi.fn()}
        placeholder="All teams"
      />
    );
    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  it("selected chips use text-foreground, not text-primary (same failing tint pair as nav)", () => {
    const { container } = render(
      <FilterMultiSelect
        options={options}
        value={["1"]}
        onChange={vi.fn()}
        placeholder="All teams"
      />
    );
    // The badge chip (not the trigger button) carries the tinted pair.
    const chip = Array.from(container.querySelectorAll("span")).find((s) =>
      s.className.includes("bg-primary/10")
    );
    expect(chip?.className).toContain("text-foreground");
    expect(chip?.className).not.toMatch(/(^|\s)text-primary(\s|$)/);
  });

  it("opens popover and filters options by search", () => {
    render(
      <FilterMultiSelect options={options} value={[]} onChange={vi.fn()} placeholder="All teams" />
    );
    fireEvent.click(screen.getByText("All teams"));
    // Search for "gam"
    const searchInput = screen.getByPlaceholderText("Search...");
    fireEvent.change(searchInput, { target: { value: "gam" } });
    expect(screen.getByText("Gamma Team")).toBeInTheDocument();
    expect(screen.queryByText("Alpha Team")).not.toBeInTheDocument();
  });

  it("toggles selection on click", () => {
    const onChange = vi.fn();
    render(
      <FilterMultiSelect options={options} value={[]} onChange={onChange} placeholder="All teams" />
    );
    // Open popover
    fireEvent.click(screen.getByText("All teams"));
    // Click the Alpha Team option
    fireEvent.click(screen.getByText("Alpha Team"));
    expect(onChange).toHaveBeenCalledWith(["1"]);
  });

  it("removes item from selection when clicked again", () => {
    const onChange = vi.fn();
    render(
      <FilterMultiSelect
        options={options}
        value={["1"]}
        onChange={onChange}
        placeholder="All teams"
      />
    );
    // Open popover — click the trigger button (first button with "Alpha Team" text)
    const trigger = screen.getAllByText("Alpha Team")[0].closest("button");
    fireEvent.click(trigger!);
    // Click the option in the dropdown
    const option = screen.getByRole("option", { name: /Alpha Team/i });
    fireEvent.click(option);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("shows selected badges with remove buttons", () => {
    render(
      <FilterMultiSelect
        options={options}
        value={["1", "2"]}
        onChange={vi.fn()}
        placeholder="All teams"
      />
    );
    // Badge labels are rendered
    expect(screen.getAllByText("Alpha Team").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Beta Team").length).toBeGreaterThanOrEqual(1);
  });

  it("clears all via clear button in popover", () => {
    const onChange = vi.fn();
    render(
      <FilterMultiSelect
        options={options}
        value={["1", "2"]}
        onChange={onChange}
        placeholder="All teams"
      />
    );
    // Open popover — click the trigger (shows "2 selected")
    fireEvent.click(screen.getByText("2 selected"));
    fireEvent.click(screen.getByText("Clear all"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("shows no results message for empty search", () => {
    render(
      <FilterMultiSelect options={options} value={[]} onChange={vi.fn()} placeholder="All teams" />
    );
    fireEvent.click(screen.getByText("All teams"));
    fireEvent.change(screen.getByPlaceholderText("Search..."), {
      target: { value: "zzz" },
    });
    expect(screen.getByText("No results found.")).toBeInTheDocument();
  });
});
