import { describe, it, expect, vi } from "vitest";
import { renderHook, render, screen, fireEvent } from "@testing-library/react";
import { useStandbyColumns } from "./useStandbyColumns";
import type { StandbyLog } from "@/types";

const today = new Date().toISOString().slice(0, 10);
const log = (over: Partial<StandbyLog>) =>
  ({ id: 7, date: today, hours: 2, status: "approved", ...over }) as unknown as StandbyLog;

function renderActions(
  row: StandbyLog,
  flags: { canApprove?: boolean; isAdmin?: boolean; isSuperuser?: boolean } = {}
) {
  const handlers = {
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  };
  const { result } = renderHook(() =>
    useStandbyColumns(
      true,
      flags.canApprove ?? false,
      handlers.onApprove,
      handlers.onReject,
      handlers.onEdit,
      handlers.onDelete,
      flags.isAdmin,
      flags.isSuperuser
    )
  );
  const actions = result.current.find((c) => c.id === "actions")!;
  render((actions.cell as any)({ row: { original: row } }));
  return handlers;
}

describe("useStandbyColumns actions", () => {
  it("offers approve and reject only for pending rows when the viewer can approve", () => {
    const h = renderActions(log({ status: "pending" }), { canApprove: true });
    fireEvent.click(screen.getByRole("button", { name: "Approve 7" }));
    expect(h.onApprove).toHaveBeenCalledWith(7);
    fireEvent.click(screen.getByRole("button", { name: "Reject 7" }));
    expect(h.onReject).toHaveBeenCalledWith(7);
  });

  it("hides approve and reject for non-pending rows", () => {
    renderActions(log({ status: "approved" }), { canApprove: true });
    expect(screen.queryByRole("button", { name: "Approve 7" })).not.toBeInTheDocument();
  });

  it("locks edit and delete of an approved past-month record for non-staff", () => {
    renderActions(log({ date: "2020-01-15" }));
    expect(screen.getByRole("button", { name: "Edit 7" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete 7" })).toBeDisabled();
  });

  it("lets a pending past-month record be deleted but not edited", () => {
    renderActions(log({ date: "2020-01-15", status: "pending" }));
    expect(screen.getByRole("button", { name: "Edit 7" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete 7" })).toBeEnabled();
  });

  it("lets a superuser delete and an admin edit past-month records", () => {
    renderActions(log({ date: "2020-01-15" }), { isAdmin: true, isSuperuser: true });
    expect(screen.getByRole("button", { name: "Edit 7" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Delete 7" })).toBeEnabled();
  });
});

describe("useStandbyColumns description", () => {
  it("renders truncated DescriptionColumn with full text available on click/hover", () => {
    const longDesc = "Primary on-call rotation covering EU and US handoff escalations";
    const { result } = renderHook(() =>
      useStandbyColumns(false, false, vi.fn(), vi.fn(), vi.fn(), vi.fn())
    );
    const col = result.current.find((c) => c.id === "description")!;
    expect(typeof col.cell).toBe("function");
    render((col.cell as any)({ row: { original: log({ description: longDesc }) } }));
    const trigger = screen.getByRole("button", { name: longDesc });
    expect(trigger.className).toContain("truncate");
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toHaveTextContent(longDesc);
  });
});
