import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemberSelectField, OptionSelect } from "./MemberSelectField";

/**
 * Radix treats `value=""` as "cleared" (the placeholder shows) but `undefined`
 * as uncontrolled, so the last picked label stays on screen after the caller
 * resets the field. Log meeting hit exactly that: changing the meeting type
 * cleared the person in state while the trigger kept showing the old name.
 * The stub records the prop the wrapper hands to Radix.
 */
const selectValues: Array<string | undefined> = [];

vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    children: React.ReactNode;
  }) => {
    selectValues.push(value);
    return (
      <div data-testid="select-root">
        <button type="button" onClick={() => onValueChange?.("7")}>
          pick
        </button>
        {children}
      </div>
    );
  },
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("OptionSelect", () => {
  it("passes an empty string, not undefined, when nothing is selected", () => {
    selectValues.length = 0;
    render(
      <OptionSelect id="person" value={null} options={[]} placeholder="Pick" onChange={vi.fn()} />
    );
    expect(selectValues).toContain("");
    expect(selectValues).not.toContain(undefined);
  });

  it("passes the selected id as a string and reports the picked id as a number", () => {
    selectValues.length = 0;
    const onChange = vi.fn();
    render(
      <OptionSelect id="person" value={4} options={[]} placeholder="Pick" onChange={onChange} />
    );
    expect(selectValues).toContain("4");
    fireEvent.click(screen.getByRole("button", { name: "pick" }));
    expect(onChange).toHaveBeenCalledWith(7);
  });
});

describe("MemberSelectField", () => {
  it("renders the label and the load error", () => {
    render(
      <MemberSelectField
        id="member"
        value={null}
        options={[]}
        onChange={vi.fn()}
        loadError="Could not load the team"
      />
    );
    expect(screen.getByText("Team member")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load the team");
  });
});
