import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TechMultiSelect } from "./TechMultiSelect";

const techs = [
  { id: 1, name: "Infrastructure", code: "INFRA", is_active: true },
  { id: 2, name: "Database", code: "DB", is_active: true },
  { id: 3, name: "Legacy", code: "OLD", is_active: false },
];

describe("TechMultiSelect", () => {
  it("renders active tech options and excludes inactive techs", () => {
    render(<TechMultiSelect techs={techs} value={[]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByText("Infrastructure")).toBeInTheDocument();
    expect(screen.getByText("Database")).toBeInTheDocument();
    expect(screen.queryByText("Legacy")).not.toBeInTheDocument();
  });

  it("emits selected Tech IDs", () => {
    const onChange = vi.fn();
    render(<TechMultiSelect techs={techs} value={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("Infrastructure"));

    expect(onChange).toHaveBeenCalledWith([1]);
  });

  it("selected chips use text-foreground, not text-primary (same failing tint pair as nav)", () => {
    render(<TechMultiSelect techs={techs} value={[1]} onChange={vi.fn()} />);

    const chip = screen.getByText("Infrastructure").closest("span");
    expect(chip?.className).toContain("text-foreground");
    expect(chip?.className).not.toMatch(/(^|\s)text-primary(\s|$)/);
  });

  it("renders already-assigned inactive Techs as read-only gray chips with (inactive) label", () => {
    // value=[3] means the inactive Tech is assigned to the user; it must
    // remain visible in the form (round 3 fix) but not be removable from
    // the dropdown (dropdown only lists active Techs).
    render(<TechMultiSelect techs={techs} value={[3]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));

    // Dropdown options are only the active Techs (Infrastructure, Database).
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(screen.getByRole("option", { name: /Infrastructure/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Database/ })).toBeInTheDocument();

    // The inactive Tech is rendered as a read-only chip below the trigger
    // (not as a dropdown option). It has the (inactive) label and no remove button.
    expect(screen.getByText("Legacy")).toBeInTheDocument();
    expect(screen.getByText("(inactive)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Remove Legacy")).toBeNull();
  });
});
