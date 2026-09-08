import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
