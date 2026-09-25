import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FlagAbsenceDialog } from "./FlagAbsenceDialog";
import { userService } from "@/services/userService";

vi.mock("@/services/userService", () => ({
  userService: {
    getMyTeamMembers: vi.fn(),
  },
}));

const MEMBER = { id: 10, user: { id: 20, username: "member1", full_name: "Member One" } };

describe("FlagAbsenceDialog", () => {
  it("disables submit until a team member is selected", async () => {
    (userService.getMyTeamMembers as ReturnType<typeof vi.fn>).mockResolvedValue([MEMBER]);
    render(<FlagAbsenceDialog open onOpenChange={() => {}} onCreate={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Member One")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /flag absence/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Team member"), { target: { value: "20" } });
    expect(screen.getByRole("button", { name: /flag absence/i })).not.toBeDisabled();
  });

  it("submits employee, date, and reason", async () => {
    (userService.getMyTeamMembers as ReturnType<typeof vi.fn>).mockResolvedValue([MEMBER]);
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<FlagAbsenceDialog open onOpenChange={() => {}} onCreate={onCreate} />);

    await waitFor(() => expect(screen.getByText("Member One")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Team member"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("Reason (if known)"), { target: { value: "No contact" } });
    fireEvent.click(screen.getByRole("button", { name: /flag absence/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ employee: 20, reason: "No contact" }));
  });
});
