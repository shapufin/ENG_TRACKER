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
});
