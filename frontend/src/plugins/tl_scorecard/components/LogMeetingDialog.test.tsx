import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { LogMeetingDialog } from "./LogMeetingDialog";
import { userService } from "@/services/userService";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, username: "leader", teams: [{ id: 5, name: "Team A" }] } }),
}));

vi.mock("@/services/userService", () => ({
  userService: {
    getMyTeamMembers: vi.fn(),
  },
}));

const MEMBER = {
  id: 10,
  user: { id: 20, username: "member1", full_name: "Member One" },
};

describe("LogMeetingDialog", () => {
  it("requires a counterparty for a one-on-one before allowing submit", async () => {
    (userService.getMyTeamMembers as ReturnType<typeof vi.fn>).mockResolvedValue([MEMBER]);
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<LogMeetingDialog open onOpenChange={() => {}} onCreate={onCreate} />);

    await waitFor(() => expect(screen.getByText("Member One")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /log meeting/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Team member"), { target: { value: "20" } });
    expect(screen.getByRole("button", { name: /log meeting/i })).not.toBeDisabled();
  });

  it("submits a one-on-one with the selected counterparty and date", async () => {
    (userService.getMyTeamMembers as ReturnType<typeof vi.fn>).mockResolvedValue([MEMBER]);
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<LogMeetingDialog open onOpenChange={() => {}} onCreate={onCreate} />);

    await waitFor(() => expect(screen.getByText("Member One")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Team member"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: /log meeting/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ meeting_type: "one_on_one", counterparty: 20, team: null })
    );
  });

  it("switches to a team field for team meetings and no counterparty is required", async () => {
    (userService.getMyTeamMembers as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<LogMeetingDialog open onOpenChange={() => {}} onCreate={onCreate} />);

    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "team_meeting" } });
    expect(screen.queryByLabelText("Team member")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /log meeting/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ meeting_type: "team_meeting", team: 5 }));
  });
});
