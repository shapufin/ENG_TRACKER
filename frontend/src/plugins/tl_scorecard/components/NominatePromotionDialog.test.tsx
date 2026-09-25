import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { NominatePromotionDialog } from "./NominatePromotionDialog";
import { userService } from "@/services/userService";

vi.mock("@/services/userService", () => ({
  userService: {
    getMyTeamMembers: vi.fn(),
  },
}));

const MEMBER = { id: 10, user: { id: 20, username: "member1", full_name: "Member One" } };

describe("NominatePromotionDialog", () => {
  it("disables submit until a team member is selected", async () => {
    (userService.getMyTeamMembers as ReturnType<typeof vi.fn>).mockResolvedValue([MEMBER]);
    render(<NominatePromotionDialog open onOpenChange={() => {}} onCreate={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Member One")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /nominate/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Team member"), { target: { value: "20" } });
    expect(screen.getByRole("button", { name: /nominate/i })).not.toBeDisabled();
  });

  it("submits the selected employee with notes", async () => {
    (userService.getMyTeamMembers as ReturnType<typeof vi.fn>).mockResolvedValue([MEMBER]);
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<NominatePromotionDialog open onOpenChange={() => {}} onCreate={onCreate} />);

    await waitFor(() => expect(screen.getByText("Member One")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Team member"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("Why this person is high-potential"), {
      target: { value: "Strong delivery" },
    });
    fireEvent.click(screen.getByRole("button", { name: /nominate/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ employee: 20, notes: "Strong delivery" }));
  });
});
