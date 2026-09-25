import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { StartEPRCycleDialog } from "./StartEPRCycleDialog";
import { userService } from "@/services/userService";

vi.mock("@/services/userService", () => ({
  userService: {
    getMyTeamMembers: vi.fn(),
  },
}));

const MEMBER = { id: 10, user: { id: 20, username: "member1", full_name: "Member One" } };

describe("StartEPRCycleDialog", () => {
  it("submits the selected employee with the current year", async () => {
    (userService.getMyTeamMembers as ReturnType<typeof vi.fn>).mockResolvedValue([MEMBER]);
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<StartEPRCycleDialog open onOpenChange={() => {}} onCreate={onCreate} />);

    await waitFor(() => expect(screen.getByText("Member One")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Team member"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: /start cycle/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledWith({ user: 20, year: new Date().getFullYear() });
  });
});
