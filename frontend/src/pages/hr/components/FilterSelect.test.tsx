import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterSelect } from "./FilterSelect";

const teams = [
  { id: 3, name: "Core Team" },
  { id: 4, name: "Backup Team" },
];

const setup = (value = "all", noneLabel?: string) => {
  const onChange = vi.fn();
  render(
    <FilterSelect
      label="Team"
      icon={null}
      value={value}
      onChange={onChange}
      placeholder="All Teams"
      allLabel="All Teams"
      noneLabel={noneLabel}
      options={teams}
      renderOption={(t) => t.name}
    />
  );
  return { onChange, trigger: screen.getByRole("combobox", { name: "Team" }) };
};

describe("FilterSelect", () => {
  it("shows the All label while nothing is filtered", () => {
    expect(setup().trigger).toHaveTextContent("All Teams");
  });

  it("reports the numeric id as a string when an item is chosen", () => {
    const { trigger, onChange } = setup();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("option", { name: "Backup Team" }));
    expect(onChange).toHaveBeenCalledWith("4");
  });

  it("filters the list by typing", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "core" } });
    expect(screen.queryByRole("option", { name: "Backup Team" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Core Team" })).toBeInTheDocument();
  });

  it("offers the None choice only when a label is given", () => {
    const { trigger, onChange } = setup("all", "None (No Filter)");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("option", { name: "None (No Filter)" }));
    expect(onChange).toHaveBeenCalledWith("none");
  });

  it("returns to All when the user picks the All choice again", () => {
    const { trigger, onChange } = setup("3");
    expect(trigger).toHaveTextContent("Core Team");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("option", { name: "All Teams" }));
    expect(onChange).toHaveBeenCalledWith("all");
  });
});
