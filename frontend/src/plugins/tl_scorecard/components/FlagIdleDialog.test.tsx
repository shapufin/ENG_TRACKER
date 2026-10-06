import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FlagIdleDialog } from "./FlagIdleDialog";
import { userService } from "@/services/userService";

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

    fireEvent.click(screen.getByRole("option", { name: "Member One" }));
    expect(screen.getByRole("button", { name: /flag idle risk/i })).not.toBeDisabled();
  });

  it("submits the selected employee with productivity task and notes", async () => {
    (userService.getMyTeamMembers as ReturnType<typeof vi.fn>).mockResolvedValue([MEMBER]);
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<FlagIdleDialog open onOpenChange={() => {}} onCreate={onCreate} />);

    await waitFor(() => expect(screen.getByText("Member One")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("option", { name: "Member One" }));
    fireEvent.change(screen.getByLabelText("Productivity task assigned"), {
      target: { value: "Doc review" },
    });
    fireEvent.change(screen.getByLabelText("Reference link"), {
      target: { value: "https://example.com/evidence" },
    });
    fireEvent.click(screen.getByRole("button", { name: /flag idle risk/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        employee: 20,
        productivity_task: "Doc review",
        reference_url: "https://example.com/evidence",
      })
    );
  });
});
