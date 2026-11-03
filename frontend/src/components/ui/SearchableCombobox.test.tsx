import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { SearchableCombobox, type ComboboxOption } from "./SearchableCombobox";

const options: ComboboxOption[] = [
  { value: "1", label: "Alice Rossi", description: "Core Team" },
  { value: "2", label: "Bob Hoxha", description: "Backup Team" },
  { value: "3", label: "Carla Gjoni" },
];

const setup = (props: Partial<React.ComponentProps<typeof SearchableCombobox>> = {}) => {
  const onChange = vi.fn();
  render(
    <SearchableCombobox
      ariaLabel="Manager"
      options={options}
      value={null}
      onChange={onChange}
      placeholder="Pick one"
      {...props}
    />
  );
  return { onChange, trigger: screen.getByRole("combobox", { name: "Manager" }) };
};

describe("SearchableCombobox", () => {
  it("shows the placeholder and stays closed until activated", () => {
    const { trigger } = setup();
    expect(trigger).toHaveTextContent("Pick one");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows the selected option label on the trigger", () => {
    const { trigger } = setup({ value: "2" });
    expect(trigger).toHaveTextContent("Bob Hoxha");
  });

  it("lists every option with its description when opened", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    const list = screen.getByRole("listbox");
    expect(within(list).getAllByRole("option")).toHaveLength(3);
    expect(within(list).getByText("Core Team")).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("filters options by label or description as the user types", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    const search = screen.getByRole("searchbox");
    fireEvent.change(search, { target: { value: "backup" } });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      expect.stringContaining("Bob Hoxha"),
    ]);
    fireEvent.change(search, { target: { value: "zzz" } });
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("selects an option on click, reports its value and closes", () => {
    const { trigger, onChange } = setup();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("option", { name: /Carla Gjoni/ }));
    expect(onChange).toHaveBeenCalledWith("3");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("supports arrow keys and Enter from the search field", () => {
    const { trigger, onChange } = setup();
    fireEvent.click(trigger);
    const search = screen.getByRole("searchbox");
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "ArrowUp" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("2");
  });

  it("marks the current value as selected", () => {
    const { trigger } = setup({ value: "1" });
    fireEvent.click(trigger);
    expect(screen.getByRole("option", { name: /Alice Rossi/ })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("option", { name: /Bob Hoxha/ })).toHaveAttribute(
      "aria-selected",
      "false"
    );
  });

  it("clears the value without opening the list when clearable", () => {
    const { onChange } = setup({ value: "1", clearable: true });
    fireEvent.click(screen.getByRole("button", { name: "Clear Manager" }));
    expect(onChange).toHaveBeenCalledWith(null);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("offers no clear button when empty or not clearable", () => {
    setup({ value: null, clearable: true });
    expect(screen.queryByRole("button", { name: "Clear Manager" })).not.toBeInTheDocument();
  });

  it("does not open or select while disabled", () => {
    const { trigger, onChange } = setup({ disabled: true });
    fireEvent.click(trigger);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not select a disabled option", () => {
    const { trigger, onChange } = setup({
      options: [...options, { value: "4", label: "Former Lead", disabled: true }],
    });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("option", { name: /Former Lead/ }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders initials for options that provide them", () => {
    const { trigger } = setup({
      options: [{ value: "1", label: "Alice Rossi", initials: "AR" }],
    });
    fireEvent.click(trigger);
    expect(screen.getByText("AR")).toBeInTheDocument();
  });
});
