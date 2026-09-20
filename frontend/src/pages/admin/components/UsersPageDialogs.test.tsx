import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UsersPageDialogs } from "./UsersPageDialogs";

vi.mock("./UserEditFormDialog", () => ({
  UserEditFormDialog: () => <div data-testid="edit-dialog" />,
}));
vi.mock("./UserCreateFormDialog", () => ({
  UserCreateFormDialog: () => <div data-testid="create-dialog" />,
}));
vi.mock("@/components/ui/FormDialog", () => ({
  FormDialog: ({ children }: any) => <div data-testid="reset-dialog">{children}</div>,
}));
vi.mock("@/components/ui/ConfirmDialog", () => ({
  ConfirmDialog: ({ onConfirm, onOpenChange, title, open }: any) =>
    title === "Delete selected users" && !open ? null : (
      <div
        data-testid={title === "Delete selected users" ? "bulk-confirm-dialog" : "confirm-dialog"}
      >
        <button onClick={onConfirm}>confirm</button>
        <button onClick={() => onOpenChange(false)}>cancel</button>
      </div>
    ),
}));
vi.mock("@/components/admin/TlRevokeBlockedDialog", () => ({
  TlRevokeBlockedDialog: (props: any) => (
    <div data-testid="tl-revoke-blocked-dialog" data-open={String(props.open)}>
      <span data-testid="tl-revoke-italian-tls">{JSON.stringify(props.italianTLs)}</span>
      <span data-testid="tl-revoke-albanian-tls">{JSON.stringify(props.albanianTLs)}</span>
      <span data-testid="tl-revoke-retrying">{String(props.retrying)}</span>
      <button onClick={props.onRetry}>retry</button>
      <button onClick={() => props.onOpenChange(false)}>close-tl-dialog</button>
    </div>
  ),
}));

const baseState = {
  formOpen: false,
  setFormOpen: vi.fn(),
  editing: null,
  form: {},
  formErrors: {},
  teamsData: [],
  albanianTLs: [],
  italianTLs: [],
  updateMutation: { isPending: false },
  handleSubmit: vi.fn(),
  setForm: vi.fn(),
  setFormErrors: vi.fn(),
  createOpen: false,
  setCreateOpen: vi.fn(),
  createForm: {},
  createErrors: {},
  handleCreate: vi.fn(),
  setCreateForm: vi.fn(),
  setCreateErrors: vi.fn(),
  userCreateMutation: { isPending: false },
  resetOpen: false,
  setResetOpen: vi.fn(),
  resetValue: "",
  setResetValue: vi.fn(),
  handleReset: vi.fn(),
  resetMutation: { isPending: false },
  confirmDelete: null,
  setConfirmDelete: vi.fn(),
  deleteMutation: { isPending: false, mutate: vi.fn() },
  bulkDeleteConfirmOpen: false,
  setBulkDeleteConfirmOpen: vi.fn(),
  selectedProfiles: [],
  bulkDeleteMutation: { isPending: false },
  handleBulkDelete: vi.fn(),
  blockedRevocations: null,
  retryBlocked: vi.fn(),
  closeBlockedDialog: vi.fn(),
  blockedRetrying: false,
} as any;

describe("UsersPageDialogs", () => {
  it("renders all dialogs", () => {
    render(<UsersPageDialogs state={baseState} />);
    expect(screen.getByTestId("edit-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("create-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("reset-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
  });

  it("renders reset password and confirm delete open", () => {
    const setResetValue = vi.fn();
    const deleteMutation = { isPending: false, mutate: vi.fn() };
    const state = {
      ...baseState,
      resetOpen: true,
      resetValue: "secret",
      setResetValue,
      confirmDelete: { user: { id: 1, username: "alice" } },
      deleteMutation,
    };
    render(<UsersPageDialogs state={state} />);
    const input = screen.getByPlaceholderText("Min 6 characters");
    expect(input).toHaveValue("secret");
    fireEvent.change(input, { target: { value: "newpass" } });
    expect(setResetValue).toHaveBeenCalledWith("newpass");
    fireEvent.click(screen.getByText("confirm"));
    expect(deleteMutation.mutate).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByText("cancel"));
    expect(baseState.setConfirmDelete).toHaveBeenCalledWith(null);
  });

  it("renders TlRevokeBlockedDialog closed when there is no blocked revocation", () => {
    render(<UsersPageDialogs state={baseState} />);
    expect(screen.getByTestId("tl-revoke-blocked-dialog")).toHaveAttribute(
      "data-open",
      "false"
    );
  });

  it("wires blockedRevocations/italianTLs/albanianTLs/retryBlocked/blockedRetrying to TlRevokeBlockedDialog", () => {
    const retryBlocked = vi.fn();
    const closeBlockedDialog = vi.fn();
    const state = {
      ...baseState,
      italianTLs: [{ id: 1, full_name: "Bob TL" }],
      albanianTLs: [{ id: 2, full_name: "Carol TL" }],
      blockedRevocations: [
        { user_id: 1, username: "tl_bob", role: "italian_tl", dependents: [] },
      ],
      retryBlocked,
      closeBlockedDialog,
      blockedRetrying: true,
    };
    render(<UsersPageDialogs state={state} />);

    const dialog = screen.getByTestId("tl-revoke-blocked-dialog");
    expect(dialog).toHaveAttribute("data-open", "true");
    expect(screen.getByTestId("tl-revoke-italian-tls")).toHaveTextContent("Bob TL");
    expect(screen.getByTestId("tl-revoke-albanian-tls")).toHaveTextContent("Carol TL");
    expect(screen.getByTestId("tl-revoke-retrying")).toHaveTextContent("true");

    fireEvent.click(screen.getByText("retry"));
    expect(retryBlocked).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("close-tl-dialog"));
    expect(closeBlockedDialog).toHaveBeenCalledTimes(1);
  });
});
