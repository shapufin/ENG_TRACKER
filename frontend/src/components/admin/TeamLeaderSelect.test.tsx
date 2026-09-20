import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TeamLeaderSelect } from "./TeamLeaderSelect";

// Radix Select is unreliable to drive via fireEvent in JSDOM (no real
// pointer capture / portal layout) — same simplified mock pattern used by
// MySkillsPage.test.tsx: render everything flat, expose role=combobox /
// role=option, and call onValueChange directly from the option's onClick.
vi.mock("@/components/ui/select", () => {
  const SelectContext = React.createContext<{ onValueChange?: (value: string) => void }>({});
  return {
    Select: ({ children, onValueChange, value, disabled }: any) => (
      <SelectContext.Provider value={{ onValueChange }}>
        <div data-disabled={disabled} data-value={value}>
          {children}
        </div>
      </SelectContext.Provider>
    ),
    SelectContent: ({ children }: any) => <div>{children}</div>,
    SelectItem: ({ value, children }: any) => {
      const context = React.useContext(SelectContext);
      return (
        <button type="button" role="option" onClick={() => context.onValueChange?.(value)}>
          {children}
        </button>
      );
    },
    SelectTrigger: ({ children, "aria-label": ariaLabel, className }: any) => (
      <button type="button" role="combobox" aria-label={ariaLabel} className={className}>
        {children}
      </button>
    ),
    SelectValue: ({ children, placeholder }: any) => <span>{children || placeholder}</span>,
  };
});

const options = [
  { id: 1, full_name: "Alice TL" },
  { id: 2, full_name: "Bob TL" },
];

describe("TeamLeaderSelect", () => {
  it("renders every option plus a No TL choice", () => {
    render(
      <TeamLeaderSelect
        ariaLabel="Italian TL for alice"
        value={null}
        options={options}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("option", { name: "No TL" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Alice TL" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Bob TL" })).toBeInTheDocument();
  });

  it("calls onChange with the selected TL's user id", () => {
    const onChange = vi.fn();
    render(
      <TeamLeaderSelect
        ariaLabel="Italian TL for alice"
        value={null}
        options={options}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole("option", { name: "Alice TL" }));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("calls onChange with null when 'No TL' is selected", () => {
    const onChange = vi.fn();
    render(
      <TeamLeaderSelect
        ariaLabel="Italian TL for alice"
        value={2}
        options={options}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole("option", { name: "No TL" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("exposes the aria-label on the trigger for row addressing", () => {
    render(
      <TeamLeaderSelect
        ariaLabel="Italian TL for alice"
        value={null}
        options={options}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("combobox", { name: "Italian TL for alice" })).toBeInTheDocument();
  });

  it("shows an inactive fallback instead of a blank when the assignee left the options", () => {
    render(
      <TeamLeaderSelect
        ariaLabel="Italian TL for alice"
        value={9}
        currentName="Former TL"
        options={options}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("option", { name: "Former TL (inactive)" })).toBeInTheDocument();
  });

  it("falls back to an id label when the assignee name is unknown", () => {
    render(
      <TeamLeaderSelect
        ariaLabel="Italian TL for alice"
        value={9}
        options={options}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("option", { name: "Former TL (#9) (inactive)" })).toBeInTheDocument();
  });
});
