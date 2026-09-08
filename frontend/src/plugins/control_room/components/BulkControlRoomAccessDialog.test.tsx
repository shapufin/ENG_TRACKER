import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BulkControlRoomAccessDialog } from "./BulkControlRoomAccessDialog";
import type { Team } from "@/types";

const teams = [
  { id: 1, name: "Alpha", code: "ALP" },
  { id: 2, name: "Beta", code: "BET" },
] as unknown as Team[];

describe("BulkControlRoomAccessDialog", () => {
  it("submits only the selected status change", () => {
    const onSubmit = vi.fn();

    render(
      <BulkControlRoomAccessDialog
        open
        onOpenChange={vi.fn()}
        selectedCount={3}
        teams={teams}
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Activate" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));

    expect(onSubmit).toHaveBeenCalledWith({ is_active: true });
  });

  it("makes replacing an empty scope explicit", () => {
    const onSubmit = vi.fn();

    render(
      <BulkControlRoomAccessDialog
        open
        onOpenChange={vi.fn()}
        selectedCount={2}
        teams={teams}
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Replace scope" }));
    expect(screen.getByText(/empty selection means no visibility/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));

    expect(onSubmit).toHaveBeenCalledWith({ team_ids: [] });
  });

  it("selected mode button uses text-foreground, not text-primary (same failing tint pair as nav)", () => {
    render(
      <BulkControlRoomAccessDialog
        open
        onOpenChange={vi.fn()}
        selectedCount={3}
        teams={teams}
        onSubmit={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Activate" }));
    const mode = screen.getByRole("button", { name: "Activate" });
    expect(mode.className).toContain("text-foreground");
    expect(mode.className).not.toMatch(/(^|\s)text-primary(\s|$)/);
  });
});
