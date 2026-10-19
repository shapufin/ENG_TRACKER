import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { useAuditLogColumns } from "./useAuditLogColumns";

type CellFn = (info: { getValue: () => unknown }) => React.ReactNode;

const cell = (header: string, value: unknown) => {
  const { result } = renderHook(() => useAuditLogColumns(() => {}));
  const column = result.current.find((c) => c.header === header) as unknown as { cell: CellFn };
  return render(<>{column.cell({ getValue: () => value })}</>);
};

describe("useAuditLogColumns", () => {
  it.each([
    ["CREATE", "tone-success"],
    ["UPDATE", "tone-warning"],
    ["DELETE", "tone-danger"],
    ["LOGIN", "tone-neutral"],
  ])("tones the %s action badge by meaning", (action, tone) => {
    cell("Action", action);
    expect(screen.getByText(action).className).toContain(tone);
  });

  it("drops the stray leading dash from the object label and keeps the full text on hover", () => {
    cell("Object", " - LeaveRequest #12");
    const label = screen.getByText("LeaveRequest #12");
    expect(label).toHaveAttribute("title", "LeaveRequest #12");
  });
});
