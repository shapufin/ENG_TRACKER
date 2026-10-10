import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { useAuditLogColumns } from "./useAuditLogColumns";

// Same failing tint pair as nav (bg-primary/10 + text-primary ≈ 3.2:1 dark).
// The create/add badge must read text-foreground. (The create-vs-other hue
// distinction is intentionally collapsed — the action label itself carries
// the meaning; the hook test below pins the single text treatment.)
describe("useAuditLogColumns action badge contrast", () => {
  it("create/add actions use text-foreground, not text-primary", () => {
    const { result } = renderHook(() => useAuditLogColumns(vi.fn()));
    const actionCol = result.current.find((c: any) => c.accessorKey === "action") as any;
    expect(actionCol).toBeTruthy();
    const { container } = render(actionCol.cell({ getValue: () => "user.create" } as any));
    const badge = container.firstElementChild;
    expect(badge?.className).toContain("text-foreground");
    expect(badge?.className).not.toMatch(/(^|\s)text-primary(\s|$)/);
  });

  it("default actions already use text-foreground (pinned, must stay)", () => {
    const { result } = renderHook(() => useAuditLogColumns(vi.fn()));
    const actionCol = result.current.find((c: any) => c.accessorKey === "action") as any;
    const { container } = render(actionCol.cell({ getValue: () => "user.login" } as any));
    expect(container.firstElementChild?.className).toContain("text-foreground");
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
