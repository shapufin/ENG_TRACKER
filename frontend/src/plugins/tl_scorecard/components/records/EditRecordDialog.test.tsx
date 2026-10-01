import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EditRecordDialog } from "./EditRecordDialog";
import type { RecordKind, RecordRow } from "./recordKinds";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 1, teams: [] } }) }));
vi.mock("@/services/userService", () => ({
  userService: { getMyTeamMembers: vi.fn(), getItalianTeamLeaders: vi.fn() },
}));

const CASES: [RecordKind, string, Record<string, unknown>, Record<string, unknown>][] = [
  ["absences", "Edit absence",
    { id: 1, employee: 20, employee_name: "Jane", absence_date: "2026-09-01", reason: "Sick", notes: "" },
    { employee: 20, absence_date: "2026-09-01", reason: "Sick" }],
  ["reviews", "Edit review delivery",
    { id: 2, leader: 1, period: "2026-08", recipient: "GM", delivered_on: "2026-09-04", notes: "" },
    { period: "2026-08", recipient: "GM", delivered_on: "2026-09-04" }],
  ["promotions", "Edit nomination",
    { id: 3, employee: 20, employee_name: "Jane", nominated_on: "2026-09-05", notes: "Strong" },
    { employee: 20, nominated_on: "2026-09-05", notes: "Strong" }],
  ["pips", "Edit PIP",
    { id: 4, employee: 20, employee_name: "Jane", start_date: "2026-09-06", notes: "Evidence" },
    { employee: 20, start_date: "2026-09-06", notes: "Evidence" }],
];

describe("EditRecordDialog", () => {
  it.each(CASES)("seeds %s from the record and keeps the employee fixed", async (kind, title, record, expected) => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<EditRecordDialog kind={kind} record={record as unknown as RecordRow} onClose={onClose} onSubmit={onSubmit} />);

    expect(screen.getByText(title)).toBeInTheDocument();
    if (record.employee_name) expect(screen.getByText("Jane")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining(expected)));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("keeps the dialog open when saving fails", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("403"));
    const onClose = vi.fn();
    render(
      <EditRecordDialog
        kind="reviews"
        record={CASES[1][2] as unknown as RecordRow}
        onClose={onClose}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Edit review delivery")).toBeInTheDocument();
  });
});
