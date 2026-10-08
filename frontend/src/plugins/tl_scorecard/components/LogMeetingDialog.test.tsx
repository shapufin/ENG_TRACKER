import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LogMeetingDialog } from "./LogMeetingDialog";
import { userService } from "@/services/userService";
import type { Meeting } from "../types/tlScorecard";

// Radix Select is unreliable to drive via fireEvent in JSDOM, so render it flat:
// the trigger is a labelled combobox and each item is an option that calls onValueChange.
vi.mock("@/components/ui/select", () => {
  const Ctx = React.createContext<{ onValueChange?: (v: string) => void }>({});
  return {
    Select: ({
      children,
      onValueChange,
    }: {
      children: React.ReactNode;
      onValueChange?: (v: string) => void;
    }) => <Ctx.Provider value={{ onValueChange }}>{children}</Ctx.Provider>,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => {
      const ctx = React.useContext(Ctx);
      return (
        <button type="button" role="option" onClick={() => ctx.onValueChange?.(value)}>
          {children}
        </button>
      );
    },
    SelectTrigger: ({ id, children }: { id?: string; children: React.ReactNode }) => (
      <button type="button" role="combobox" id={id}>
        {children}
      </button>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  };
});

const auth = vi.hoisted(() => ({
  teams: [{ id: 5, name: "Team A" }] as { id: number; name: string }[],
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, username: "leader", teams: auth.teams } }),
}));

vi.mock("@/services/userService", () => ({
  userService: {
    getMyTeamMembers: vi.fn(),
    getItalianTeamLeaders: vi.fn(),
  },
}));

const MEMBER = { id: 10, user: { id: 20, username: "member1", full_name: "Member One" } };
const ITALY_TL = {
  id: 77,
  username: "tl_it",
  full_name: "Italy Lead",
  team_name: null,
  member_count: 4,
};

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const pick = (label: string) => fireEvent.click(screen.getByRole("option", { name: label }));

describe("LogMeetingDialog", () => {
  beforeEach(() => {
    auth.teams = [{ id: 5, name: "Team A" }];
    mocked(userService.getMyTeamMembers).mockResolvedValue([MEMBER]);
    mocked(userService.getItalianTeamLeaders).mockResolvedValue([ITALY_TL]);
  });

  it("uses the standard form width, not the confirm-prompt width", () => {
    render(<LogMeetingDialog open onOpenChange={() => {}} onCreate={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("max-w-lg");
    expect(dialog).not.toHaveClass("max-w-md");
  });

  it("requires a counterparty for a one-on-one before allowing submit", async () => {
    render(<LogMeetingDialog open onOpenChange={() => {}} onCreate={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Member One" })).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: /log meeting/i })).toBeDisabled();

    pick("Member One");
    expect(screen.getByRole("button", { name: /log meeting/i })).not.toBeDisabled();
  });

  it("submits a one-on-one with the selected counterparty and date", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<LogMeetingDialog open onOpenChange={() => {}} onCreate={onCreate} />);

    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Member One" })).toBeInTheDocument()
    );
    pick("Member One");
    fireEvent.click(screen.getByRole("button", { name: /log meeting/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ meeting_type: "one_on_one", counterparty: 20, team: null })
    );
  });

  it("offers Italy team leaders (not team members) for a TL sync", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<LogMeetingDialog open onOpenChange={() => {}} onCreate={onCreate} />);

    pick("TL sync (Technical Lead in Italy)");
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Italy Lead" })).toBeInTheDocument()
    );
    expect(screen.queryByRole("option", { name: "Member One" })).not.toBeInTheDocument();

    pick("Italy Lead");
    fireEvent.click(screen.getByRole("button", { name: /log meeting/i }));
    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({ meeting_type: "tl_sync", counterparty: 77, team: null })
      )
    );
  });

  it("uses the only team for a team meeting with no counterparty", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<LogMeetingDialog open onOpenChange={() => {}} onCreate={onCreate} />);

    pick("Team meeting");
    expect(screen.queryByRole("combobox", { name: /team member/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /log meeting/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ meeting_type: "team_meeting", counterparty: null, team: 5 })
    );
  });

  it("asks which team when the leader has several instead of assuming the first", async () => {
    auth.teams = [
      { id: 5, name: "Team A" },
      { id: 6, name: "Team B" },
    ];
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<LogMeetingDialog open onOpenChange={() => {}} onCreate={onCreate} />);

    pick("Team meeting");
    pick("Team B");
    fireEvent.click(screen.getByRole("button", { name: /log meeting/i }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ team: 6 }))
    );
  });

  it("shows a message when the people list fails to load", async () => {
    mocked(userService.getMyTeamMembers).mockRejectedValue(new Error("boom"));
    render(<LogMeetingDialog open onOpenChange={() => {}} onCreate={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/i);
  });

  it("edits date and notes of an existing meeting without asking for a counterparty", async () => {
    const initial = {
      id: 3,
      meeting_type: "one_on_one",
      organizer: 1,
      organizer_name: "Me",
      counterparty: 20,
      counterparty_name: "Member One",
      team: null,
      occurred_on: "2026-09-02",
      notes: "old",
      shared_summary: "",
      shared_at: null,
    } as Meeting;
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(
      <LogMeetingDialog
        open
        mode="edit"
        initial={initial}
        onOpenChange={() => {}}
        onCreate={onCreate}
      />
    );

    expect(screen.getByText("Edit meeting")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "new notes" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({ counterparty: 20, occurred_on: "2026-09-02", notes: "new notes" })
      )
    );
  });
});
