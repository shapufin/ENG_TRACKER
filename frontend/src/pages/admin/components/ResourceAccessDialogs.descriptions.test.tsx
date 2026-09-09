import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ResourceAccessGroupDialog } from "./ResourceAccessGroupDialog";
import { ResourceAccessMemberDialog } from "./ResourceAccessMemberDialog";

vi.mock("../hooks/useMemberCandidates", () => ({
  useMemberCandidates: () => ({ data: undefined, isLoading: false, isFetching: false }),
}));

const renderWithClient = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

// Mechanical pass: title-only headers gain a one-line description.
describe("ResourceAccess dialogs descriptions", () => {
  it("group dialog (create + edit) renders a description", () => {
    const { unmount } = renderWithClient(
      <ResourceAccessGroupDialog open onOpenChange={vi.fn()} onSubmit={vi.fn()} isPending={false} />
    );
    expect(screen.getByRole("heading", { name: "Create group" })).toBeInTheDocument();
    expect(
      screen.getByText("Name the group, give it a short code, and say who it is for.")
    ).toBeInTheDocument();
    unmount();
    renderWithClient(
      <ResourceAccessGroupDialog
        open
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        isPending={false}
        editingGroup={{ id: 1, name: "G", code: "G", description: "" } as any}
      />
    );
    expect(screen.getByRole("heading", { name: "Edit group" })).toBeInTheDocument();
    expect(
      screen.getByText("Name the group, give it a short code, and say who it is for.")
    ).toBeInTheDocument();
  });

  it("member dialog renders a description", () => {
    renderWithClient(
      <ResourceAccessMemberDialog
        open
        onOpenChange={vi.fn()}
        groupId={1}
        groupName="G"
        onAdd={vi.fn()}
        isPending={false}
      />
    );
    expect(screen.getByRole("heading", { name: "Add member to G" })).toBeInTheDocument();
    expect(screen.getByText("Search users and add one to this group.")).toBeInTheDocument();
  });

  it("both dialogs keep the scroll contract", () => {
    const { unmount } = renderWithClient(
      <ResourceAccessGroupDialog open onOpenChange={vi.fn()} onSubmit={vi.fn()} isPending={false} />
    );
    const groupDlg = document.querySelector("[role='dialog']") as HTMLElement;
    expect(groupDlg.className).toContain("flex-col");
    expect(groupDlg.className).toContain("overflow-hidden");
    expect(groupDlg.querySelector(".flex-1.overflow-y-auto")).not.toBeNull();
    unmount();
    renderWithClient(
      <ResourceAccessMemberDialog
        open
        onOpenChange={vi.fn()}
        groupId={1}
        groupName="G"
        onAdd={vi.fn()}
        isPending={false}
      />
    );
    const memberDlg = document.querySelector("[role='dialog']") as HTMLElement;
    expect(memberDlg.className).toContain("flex-col");
    expect(memberDlg.className).toContain("overflow-hidden");
    expect(memberDlg.querySelector(".flex-1.overflow-y-auto")).not.toBeNull();
  });
});
