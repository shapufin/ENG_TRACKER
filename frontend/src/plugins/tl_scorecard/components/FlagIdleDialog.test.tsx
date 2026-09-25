import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FlagIdleDialog } from "./FlagIdleDialog";
import { userService } from "@/services/userService";

vi.mock("@/services/userService", () => ({
  userService: {
    getMyTeamMembers: vi.fn(),
  },
}));

const MEMBER = {
  id: 10,
  user: { id: 20, username: "member1", full_name: "Member One" },
};

describe("FlagIdleDialog", () => {
  it("disables submit until a team member is selected", async () => {
    (userService.getMyTeamMembers as ReturnType<typeof vi.fn>).mockResolvedValue([MEMBER]);
    render(<FlagIdleDialog open onOpenChange={() => {}} onCreate={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Member One")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /flag idle risk/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Team member"), { target: { value: "20" } });
    expect(screen.getByRole("button", { name: /flag idle risk/i })).not.toBeDisabled();
  });

  it("submits the selected employee with productivity task and notes", async () => {
    (userService.getMyTeamMembers as ReturnType<typeof vi.fn>).mockResolvedValue([MEMBER]);
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<FlagIdleDialog open onOpenChange={() => {}} onCreate={onCreate} />);

    await waitFor(() => expect(screen.getByText("Member One")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Team member"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("Productivity task assigned"), {
      target: { value: "Doc review" },
    });
    fireEvent.click(screen.getByRole("button", { name: /flag idle risk/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ employee: 20, productivity_task: "Doc review" })
    );
  });
});
