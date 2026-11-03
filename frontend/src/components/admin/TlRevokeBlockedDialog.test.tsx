import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TlRevokeBlockedDialog } from "./TlRevokeBlockedDialog";
import type { BlockedRevocation } from "@/types";

vi.mock("@/services/userService", () => ({
  userService: { setTeamLeader: vi.fn() },
}));
vi.mock("@/lib/error-handler", () => ({ handleApiError: vi.fn() }));

import { userService } from "@/services/userService";
import { handleApiError } from "@/lib/error-handler";

// Opens the n-th picker (0 = group bulk picker, then one per dependent) and chooses an option.
const pick = (picker: number, name: string | RegExp) => {
  fireEvent.click(screen.getAllByRole("combobox")[picker]);
  fireEvent.click(screen.getByRole("option", { name }));
};

const blockedRevocations: BlockedRevocation[] = [
  {
    user_id: 1,
    username: "tl_bob",
    role: "italian_tl",
    dependents: [
      { profile_id: 10, user_id: 100, username: "alice" },
      { profile_id: 11, user_id: 101, username: "carol" },
    ],
  },
];

const italianTLs = [{ id: 5, full_name: "Dave TL" }];
const albanianTLs = [{ id: 6, full_name: "Eve TL" }];

describe("TlRevokeBlockedDialog", () => {
  beforeEach(() => {
    vi.mocked(userService.setTeamLeader).mockReset();
    vi.mocked(handleApiError).mockReset();
  });

  it("lists every blocked TL and their dependents", () => {
    render(
      <TlRevokeBlockedDialog
        open
        onOpenChange={vi.fn()}
        blockedRevocations={blockedRevocations}
        italianTLs={italianTLs}
        albanianTLs={albanianTLs}
        onRetry={vi.fn()}
      />
    );
    expect(screen.getByText(/tl_bob/)).toBeInTheDocument();
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("carol")).toBeInTheDocument();
  });

  it("Retry is disabled until every dependent is resolved", async () => {
    vi.mocked(userService.setTeamLeader).mockResolvedValue({} as any);
    render(
      <TlRevokeBlockedDialog
        open
        onOpenChange={vi.fn()}
        blockedRevocations={blockedRevocations}
        italianTLs={italianTLs}
        albanianTLs={albanianTLs}
        onRetry={vi.fn()}
      />
    );
    const retryButton = screen.getByRole("button", { name: "Retry" });
    expect(retryButton).toBeDisabled();

    pick(1, /Dave TL/);
    await waitFor(() => expect(userService.setTeamLeader).toHaveBeenCalledTimes(1));
    expect(retryButton).toBeDisabled();
  });

  it("calls setTeamLeader with the dependent's profile id and the picked TL, then enables Retry once all resolved", async () => {
    vi.mocked(userService.setTeamLeader).mockResolvedValue({} as any);
    const onRetry = vi.fn();
    render(
      <TlRevokeBlockedDialog
        open
        onOpenChange={vi.fn()}
        blockedRevocations={blockedRevocations}
        italianTLs={italianTLs}
        albanianTLs={albanianTLs}
        onRetry={onRetry}
      />
    );

    pick(1, /Dave TL/);
    await waitFor(() =>
      expect(userService.setTeamLeader).toHaveBeenCalledWith(10, "italian_tl", 5)
    );

    pick(2, "No TL");
    await waitFor(() =>
      expect(userService.setTeamLeader).toHaveBeenCalledWith(11, "italian_tl", null)
    );

    const retryButton = screen.getByRole("button", { name: "Retry" });
    await waitFor(() => expect(retryButton).not.toBeDisabled());
    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("surfaces a mutation error via handleApiError without marking the row resolved", async () => {
    vi.mocked(userService.setTeamLeader).mockRejectedValue(new Error("boom"));
    render(
      <TlRevokeBlockedDialog
        open
        onOpenChange={vi.fn()}
        blockedRevocations={blockedRevocations}
        italianTLs={italianTLs}
        albanianTLs={albanianTLs}
        onRetry={vi.fn()}
      />
    );
    pick(1, /Dave TL/);
    await waitFor(() => expect(handleApiError).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Retry" })).toBeDisabled();
  });

  it("bulk-applies the picked TL to every dependent in that group at once", async () => {
    vi.mocked(userService.setTeamLeader).mockResolvedValue({} as any);
    const onRetry = vi.fn();
    render(
      <TlRevokeBlockedDialog
        open
        onOpenChange={vi.fn()}
        blockedRevocations={blockedRevocations}
        italianTLs={italianTLs}
        albanianTLs={albanianTLs}
        onRetry={onRetry}
      />
    );

    pick(0, /Dave TL/);

    await waitFor(() => expect(userService.setTeamLeader).toHaveBeenCalledTimes(2));
    expect(userService.setTeamLeader).toHaveBeenCalledWith(10, "italian_tl", 5);
    expect(userService.setTeamLeader).toHaveBeenCalledWith(11, "italian_tl", 5);

    const retryButton = screen.getByRole("button", { name: "Retry" });
    await waitFor(() => expect(retryButton).not.toBeDisabled());
  });

  it("HBPR-guard entries render the assignment_count line and leave Retry enabled", () => {
    const hbprBlocked: BlockedRevocation[] = [
      {
        user_id: 2,
        username: "elda",
        role: "hbpr",
        dependents: [],
        assignment_count: 2,
      },
    ];
    render(
      <TlRevokeBlockedDialog
        open
        onOpenChange={vi.fn()}
        blockedRevocations={hbprBlocked}
        italianTLs={italianTLs}
        albanianTLs={albanianTLs}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByText(/elda/)).toBeInTheDocument();
    expect(
      screen.getByText(/open HBPR↔Line Manager assignment\(s\) depend on this role/)
    ).toBeInTheDocument();
    // Nothing to reassign inside the dialog — Retry is usable immediately.
    expect(screen.getByRole("button", { name: "Retry" })).not.toBeDisabled();
  });

  it("does not render when closed", () => {
    render(
      <TlRevokeBlockedDialog
        open={false}
        onOpenChange={vi.fn()}
        blockedRevocations={blockedRevocations}
        italianTLs={italianTLs}
        albanianTLs={albanianTLs}
        onRetry={vi.fn()}
      />
    );
    expect(screen.queryByText("Resolve dependencies first")).not.toBeInTheDocument();
  });
});
