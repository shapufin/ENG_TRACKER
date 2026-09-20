import React from "react";
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

// Same simplified Select mock as TeamLeaderSelect.test.tsx.
vi.mock("@/components/ui/select", () => {
  const SelectContext = React.createContext<{ onValueChange?: (value: string) => void }>({});
  return {
    Select: ({ children, onValueChange, disabled }: any) => (
      <SelectContext.Provider value={{ onValueChange }}>
        <div data-disabled={disabled}>{children}</div>
      </SelectContext.Provider>
    ),
    SelectContent: ({ children }: any) => <div>{children}</div>,
    SelectItem: ({ value, children }: any) => {
      const context = React.useContext(SelectContext);
      return (
        <button type="button" role="option" onClick={() => context.onValueChange?.(value)}>
          {children}
        </button>
      );
    },
    SelectTrigger: ({ children, "aria-label": ariaLabel }: any) => (
      <button type="button" role="combobox" aria-label={ariaLabel}>
        {children}
      </button>
    ),
    SelectValue: ({ children, placeholder }: any) => <span>{children || placeholder}</span>,
  };
});

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

    fireEvent.click(screen.getAllByRole("option", { name: "Dave TL" })[1]);
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

    const options = screen.getAllByRole("option", { name: "Dave TL" });
    fireEvent.click(options[1]);
    await waitFor(() => expect(userService.setTeamLeader).toHaveBeenCalledWith(10, "italian_tl", 5));

    fireEvent.click(screen.getAllByRole("option", { name: "No TL" })[2]);
    await waitFor(() => expect(userService.setTeamLeader).toHaveBeenCalledWith(11, "italian_tl", null));

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
    fireEvent.click(screen.getAllByRole("option", { name: "Dave TL" })[1]);
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

    fireEvent.click(screen.getAllByRole("option", { name: "Dave TL" })[0]);

    await waitFor(() => expect(userService.setTeamLeader).toHaveBeenCalledTimes(2));
    expect(userService.setTeamLeader).toHaveBeenCalledWith(10, "italian_tl", 5);
    expect(userService.setTeamLeader).toHaveBeenCalledWith(11, "italian_tl", 5);

    const retryButton = screen.getByRole("button", { name: "Retry" });
    await waitFor(() => expect(retryButton).not.toBeDisabled());
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
    expect(screen.queryByText("Reassign team members first")).not.toBeInTheDocument();
  });
});
