import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { useAuditLogColumns } from "./useAuditLogColumns";

// The old bg-primary/10 + text-primary pair measured ~3.2:1 in dark. Action badges
// now use the shared tone tokens (AA in both themes), so the pin is: never the
// primary tint pair, and the tone follows the action (server actions are upper-case).
describe("useAuditLogColumns action badge tone", () => {
  const badge = (action: string) => {
    const { result } = renderHook(() => useAuditLogColumns(vi.fn()));
    const actionCol = result.current.find((c: any) => c.accessorKey === "action") as any;
    expect(actionCol).toBeTruthy();
    const { container } = render(actionCol.cell({ getValue: () => action } as any));
    return container.firstElementChild as HTMLElement;
  };

  it.each([
    ["CREATE", "tone-success"],
    ["user.create", "tone-success"],
    ["UPDATE", "tone-warning"],
    ["DELETE", "tone-danger"],
    ["user.login", "tone-neutral"],
  ])("tones the %s badge by meaning", (action, tone) => {
    expect(badge(action).className).toContain(tone);
  });

  it("never falls back to the failing primary tint pair", () => {
    for (const action of ["CREATE", "UPDATE", "DELETE", "user.login"]) {
      expect(badge(action).className).not.toMatch(/(^|\s)text-primary(\s|$)/);
    }
  });
});

describe("useAuditLogColumns object label", () => {
  it("drops a stray leading dash and keeps the full text on hover", () => {
    const { result } = renderHook(() => useAuditLogColumns(vi.fn()));
    const col = result.current.find((c: any) => c.accessorKey === "object_repr") as any;
    render(col.cell({ getValue: () => " - LeaveRequest #12" } as any));
    expect(screen.getByText("LeaveRequest #12")).toHaveAttribute("title", "LeaveRequest #12");
  });
});

describe("useAuditLogColumns timestamp and details", () => {
  it("renders a short, non-wrapping timestamp with the full value in title", () => {
    const { result } = renderHook(() => useAuditLogColumns(vi.fn()));
    const col = result.current.find((c: any) => c.accessorKey === "timestamp") as any;
    const iso = "2026-03-05T14:07:00Z";
    const { container } = render(col.cell({ getValue: () => iso } as any));
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain("whitespace-nowrap");
    expect(el.getAttribute("title")).toBe(new Date(iso).toLocaleString());
    expect(el.textContent).not.toBe(new Date(iso).toLocaleString());
    expect(el.textContent).toMatch(/2026/);
  });

  it("opens the log from a single View details icon action", () => {
    const onView = vi.fn();
    const { result } = renderHook(() => useAuditLogColumns(onView));
    const col = result.current.find((c: any) => c.id === "details") as any;
    const row = { id: 7 };
    render(col.cell({ row: { original: row } } as any));
    expect(screen.queryByText("View")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View log details" }));
    expect(onView).toHaveBeenCalledWith(row);
  });
});
