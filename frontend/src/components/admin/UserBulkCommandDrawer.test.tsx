import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { UserBulkCommandDrawer } from "./UserBulkCommandDrawer";

const onBulkUpdate = vi.fn();

vi.mock("./TeamMultiSelect", () => ({
  TeamMultiSelect: ({ onChange, disabled }: { onChange: (ids: number[]) => void; disabled?: boolean }) => (
    <button type="button" disabled={disabled} onClick={() => onChange([1, 2])}>
      Choose teams
    </button>
  ),
}));

const selectedProfiles = [
  { id: 1, user: { id: 11, username: "alice" } },
  { id: 2, user: { id: 12, username: "bob" } },
] as any;

const renderDrawer = () =>
  render(
    <UserBulkCommandDrawer
      open
      onOpenChange={vi.fn()}
      selectedProfiles={selectedProfiles}
      teams={{ results: [{ id: 1, name: "Team A", code: "A" }] as any }}
      italianTLs={[]}
      albanianTLs={[]}
      onBulkUpdate={onBulkUpdate}
    />
  );

/** Helper: click the role toggle row by its label text. */
const clickRole = (label: string) => {
  const row = screen.getByText(label).closest("label");
  if (!row) throw new Error(`Role row "${label}" not found`);
  fireEvent.click(row);
};

describe("UserBulkCommandDrawer", () => {
  beforeEach(() => onBulkUpdate.mockReset());

  it("renders the focused structured editor without groups or danger tabs", () => {
    renderDrawer();

    expect(screen.getByText("Bulk edit users")).toBeInTheDocument();
    expect(screen.getByText("Teams")).toBeInTheDocument();
    expect(screen.getByText("Team leader assignments")).toBeInTheDocument();
    expect(screen.getByText("Roles")).toBeInTheDocument();
    expect(screen.queryByText("Groups")).not.toBeInTheDocument();
    expect(screen.queryByText("Delete Users")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply changes" })).toBeDisabled();
  });

  it("submits a multi-team replacement payload", () => {
    renderDrawer();

    fireEvent.click(screen.getByRole("checkbox", { name: "Apply team changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose teams" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));

    expect(onBulkUpdate).toHaveBeenCalledWith({ teams: [1, 2] });
  });

  it("role checkboxes start indeterminate (unchanged) and are not sent in payload", () => {
    renderDrawer();

    // Apply button disabled because nothing changed.
    expect(screen.getByRole("button", { name: "Apply changes" })).toBeDisabled();
  });

  it("cycles HR role: indeterminate → on → off → indeterminate", () => {
    renderDrawer();

    // indeterminate → on
    clickRole("HR");
    expect(onBulkUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));
    expect(onBulkUpdate).toHaveBeenCalledWith({ is_hr: true });
    onBulkUpdate.mockReset();

    // on → off
    clickRole("HR");
    fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));
    expect(onBulkUpdate).toHaveBeenCalledWith({ is_hr: false });
    onBulkUpdate.mockReset();

    // off → indeterminate (back to unchanged, button disabled)
    clickRole("HR");
    expect(screen.getByRole("button", { name: "Apply changes" })).toBeDisabled();
  });

  it("sends multiple role changes together", () => {
    renderDrawer();

    clickRole("HR");
    clickRole("Italian TL role");
    clickRole("Italian TL role"); // on → off
    fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));

    expect(onBulkUpdate).toHaveBeenCalledWith({
      is_hr: true,
      is_italian_tl_role: false,
    });
  });
});
