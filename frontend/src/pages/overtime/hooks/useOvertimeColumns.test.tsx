import { describe, it, expect, vi } from "vitest";
import { renderHook, render, screen, fireEvent } from "@testing-library/react";
import { useOvertimeColumns } from "./useOvertimeColumns";
import type { OvertimeLog } from "@/types";

const today = new Date().toISOString().slice(0, 10);
const log = (over: Partial<OvertimeLog>) =>
  ({ id: 7, date: today, hours: 2, status: "approved", ...over }) as unknown as OvertimeLog;

function renderActions(
  row: OvertimeLog,
  flags: { canApprove?: boolean; isAdmin?: boolean; isSuperuser?: boolean } = {}
) {
  const handlers = {
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  };
  const { result } = renderHook(() =>
    useOvertimeColumns(
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

describe("useOvertimeColumns actions", () => {
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

describe("useOvertimeColumns ticket_references", () => {
  function getTicketColumn() {
    const { result } = renderHook(() =>
      useOvertimeColumns(true, false, vi.fn(), vi.fn(), vi.fn(), vi.fn())
    );
    const col = result.current.find((c) => c.id === "ticket_references");
    expect(col).toBeDefined();
    return col!;
  }

  it("defines Ticket ID column with proper id and header", () => {
    const col = getTicketColumn();
    expect(col.header).toBe("Ticket ID");
  });

  it("renders a hyphen when ticket_references is empty or missing", () => {
    const col = getTicketColumn();
    const { container: emptyContainer } = render(
      (col.cell as any)({ row: { original: log({ ticket_references: [] }) } })
    );
    expect(emptyContainer.textContent).toBe("-");

    const { container: missingContainer } = render(
      (col.cell as any)({ row: { original: log({ ticket_references: undefined as any }) } })
    );
    expect(missingContainer.textContent).toBe("-");
  });

  it("renders ticket badges when present", () => {
    const col = getTicketColumn();
    const { container } = render(
      (col.cell as any)({
        row: { original: log({ ticket_references: ["INC-100", "INC-102"] }) },
      })
    );
    expect(screen.getByText("INC-100")).toBeInTheDocument();
    expect(screen.getByText("INC-102")).toBeInTheDocument();
    expect(container.firstChild).toHaveAttribute("title", "INC-100, INC-102");
  });
});

describe("useOvertimeColumns payroll_period", () => {
  function getPayrollColumn() {
    const { result } = renderHook(() =>
      useOvertimeColumns(true, false, vi.fn(), vi.fn(), vi.fn(), vi.fn())
    );
    const col = result.current.find((c) => c.id === "payroll_period");
    expect(col).toBeDefined();
    return col!;
  }

  it("renders Next month badge for carried over records", () => {
    const col = getPayrollColumn();
    render(
      (col.cell as any)({
        row: { original: log({ is_carried_over: true, requested_period_label: "11/2026" }) },
      })
    );
    const badge = screen.getByText("Next month");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("title", "Carried to 11/2026");
  });

  it("renders Same month text for regular records", () => {
    const col = getPayrollColumn();
    render((col.cell as any)({ row: { original: log({ is_carried_over: false }) } }));
    expect(screen.getByText("Same month")).toBeInTheDocument();
  });
});
