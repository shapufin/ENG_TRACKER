import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TeamLeaderSelect } from "./TeamLeaderSelect";

const options = [
  { id: 1, full_name: "Alice TL" },
  { id: 2, full_name: "Bob TL" },
];

const open = () => fireEvent.click(screen.getByRole("combobox", { name: "Manager for alice" }));

describe("TeamLeaderSelect", () => {
  it("renders every option plus a No TL choice", () => {
    render(
      <TeamLeaderSelect
        ariaLabel="Manager for alice"
        value={null}
        options={options}
        onChange={vi.fn()}
      />
    );
    open();
    expect(screen.getByRole("option", { name: "No TL" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Alice TL/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Bob TL/ })).toBeInTheDocument();
  });

  it("calls onChange with the selected TL's user id", () => {
    const onChange = vi.fn();
    render(
      <TeamLeaderSelect
        ariaLabel="Manager for alice"
        value={null}
        options={options}
        onChange={onChange}
      />
    );
    open();
    fireEvent.click(screen.getByRole("option", { name: /Alice TL/ }));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("calls onChange with null when 'No TL' is selected", () => {
    const onChange = vi.fn();
    render(
      <TeamLeaderSelect
        ariaLabel="Manager for alice"
        value={2}
        options={options}
        onChange={onChange}
      />
    );
    open();
    fireEvent.click(screen.getByRole("option", { name: "No TL" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("exposes the aria-label on the trigger for row addressing", () => {
    render(
      <TeamLeaderSelect
        ariaLabel="Manager for alice"
        value={null}
        options={options}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("combobox", { name: "Manager for alice" })).toBeInTheDocument();
  });

  it("finds a leader by typing part of the name", () => {
    render(
      <TeamLeaderSelect
        ariaLabel="Manager for alice"
        value={null}
        options={options}
        onChange={vi.fn()}
      />
    );
    open();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "bob" } });
    expect(screen.queryByRole("option", { name: /Alice TL/ })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Bob TL/ })).toBeInTheDocument();
  });

  it("shows an inactive fallback instead of a blank when the assignee left the options", () => {
    render(
      <TeamLeaderSelect
        ariaLabel="Manager for alice"
        value={9}
        currentName="Former TL"
        options={options}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("combobox", { name: "Manager for alice" })).toHaveTextContent(
      "Former TL (inactive)"
    );
  });

  it("falls back to an id label when the assignee name is unknown", () => {
    render(
      <TeamLeaderSelect
        ariaLabel="Manager for alice"
        value={9}
        options={options}
        onChange={vi.fn()}
      />
    );
    open();
    expect(screen.getByRole("option", { name: "Former TL (#9) (inactive)" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
  });
});
