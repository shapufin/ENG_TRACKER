import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EraseUserDialog } from "./EraseUserDialog";
import { userService } from "@/services/userService";

vi.mock("@/services/userService", () => ({
  userService: { getErasePreview: vi.fn(), eraseUser: vi.fn() },
}));

const preview = {
  user_id: 7,
  username: "left",
  can_erase: true,
  reasons: [],
  will_delete: { "overtime.OvertimeLog": 2, "tl_scorecard.Absence": 1 },
  about_other_people: { "tl_scorecard.Absence": 1 },
  protected: {},
  closed_years: [],
  leader_links_cleared: { italian_tl: 0, albanian_tl: 0, led_teams: 0 },
  confirm_phrase: "ERASE left",
  min_reason_length: 10,
};

const renderDialog = (onClose = vi.fn()) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <EraseUserDialog userId={7} username="left" onClose={onClose} />
    </QueryClientProvider>
  );
  return onClose;
};

describe("EraseUserDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enables Erase only after the phrase, a reason and the acknowledgement", async () => {
    vi.mocked(userService.getErasePreview).mockResolvedValue(preview);
    vi.mocked(userService.eraseUser).mockResolvedValue({ erased: true });
    const onClose = renderDialog();

    const button = await screen.findByRole("button", { name: "Erase user" });
    await screen.findByText(/3 records will be erased/);
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "Duplicate account" } });
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: "ERASE left" } });
    expect(button).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(button).toBeEnabled();

    fireEvent.click(button);
    await waitFor(() =>
      expect(userService.eraseUser).toHaveBeenCalledWith(7, {
        confirm: "ERASE left",
        reason: "Duplicate account",
        acknowledge_other_people_records: true,
      })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("shows the server's reasons and no form when the user cannot be erased", async () => {
    vi.mocked(userService.getErasePreview).mockResolvedValue({
      ...preview,
      can_erase: false,
      reasons: ["Deactivate the user first; only an inactive user can be erased."],
    });
    renderDialog();

    expect(await screen.findByText(/Deactivate the user first/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Reason/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Erase user" })).toBeDisabled();
  });
});
