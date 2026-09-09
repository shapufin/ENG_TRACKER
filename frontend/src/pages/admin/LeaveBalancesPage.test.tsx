import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LeaveBalancesPage } from "./LeaveBalancesPage";

vi.mock("@/context/PermissionContext", () => ({ usePermissions: vi.fn() }));
vi.mock("@/hooks/useLeaveBalances", () => ({ useLeaveBalances: vi.fn() }));
vi.mock("./hooks/useLeaveBalanceForm", () => ({ useLeaveBalanceForm: vi.fn() }));
vi.mock("./hooks/useLeaveBalanceColumns", () => ({ useLeaveBalanceColumns: vi.fn() }));
vi.mock("@/components/ui/DataTable", () => ({ DataTable: () => <div data-testid="data-table" /> }));
vi.mock("@/components/ui/LoadingCard", () => ({
  LoadingCard: () => <div data-testid="loading" />,
}));
vi.mock("@/components/ui/ErrorCard", () => ({
  ErrorCard: ({ title, onRetry }: any) => (
    <div data-testid="error">
      <span>{title}</span>
      <button onClick={onRetry}>Retry</button>
    </div>
  ),
}));
vi.mock("./components/LeaveBalanceFormDialog", () => ({
  LeaveBalanceFormDialog: () => <div data-testid="form-dialog" />,
}));
vi.mock("@/components/ui/ConfirmDialog", () => ({
  ConfirmDialog: () => <div data-testid="confirm" />,
}));
vi.mock("react-router-dom", () => ({
  Navigate: ({ to }: any) => <div data-testid="navigate">{to}</div>,
}));

import { usePermissions } from "@/context/PermissionContext";
import { useLeaveBalances } from "@/hooks/useLeaveBalances";
import { useLeaveBalanceForm } from "./hooks/useLeaveBalanceForm";

// PluginImportButton (admin page headers) reads the active-plugin list. With
// data_import inactive it renders nothing — the same graceful path taken when
// the plugin is disabled or removed.
vi.mock("@/context/PluginContext", () => ({
  usePlugins: () => ({ activePlugins: [], isLoading: false }),
}));

const mockForm = {
  formOpen: false,
  setFormOpen: vi.fn(),
  editing: null,
  form: {},
  formErrors: {},
  openCreate: vi.fn(),
  openEdit: vi.fn(),
  buildPayload: () => ({}),
  setFormErrors: vi.fn(),
  setForm: vi.fn(),
  setEditing: vi.fn(),
};

const mockBalances = {
  balances: [{ id: 1, user_name: "Alice" }],
  users: [],
  isLoading: false,
  isError: false,
  createMutation: { mutate: vi.fn(), isPending: false },
  updateMutation: { mutate: vi.fn(), isPending: false },
  deleteMutation: { mutate: vi.fn() },
};

describe("LeaveBalancesPage", () => {
  it("redirects non-admin", () => {
    vi.mocked(usePermissions).mockReturnValue({ isAdmin: false } as any);
    render(<LeaveBalancesPage />);
    expect(screen.getByText("/leave-management")).toBeInTheDocument();
  });

  it("shows loading", () => {
    vi.mocked(usePermissions).mockReturnValue({ isAdmin: true } as any);
    vi.mocked(useLeaveBalanceForm).mockReturnValue(mockForm as any);
    vi.mocked(useLeaveBalances).mockReturnValue({ ...mockBalances, isLoading: true } as any);
    render(<LeaveBalancesPage />);
    expect(screen.getByTestId("loading")).toBeInTheDocument();
  });

  it("shows error when the query fails", () => {
    vi.mocked(usePermissions).mockReturnValue({ isAdmin: true } as any);
    vi.mocked(useLeaveBalanceForm).mockReturnValue(mockForm as any);
    vi.mocked(useLeaveBalances).mockReturnValue({ ...mockBalances, isError: true } as any);
    render(<LeaveBalancesPage />);
    expect(screen.getByTestId("error")).toBeInTheDocument();
  });

  it("renders the table (not an error) when there are simply no balances yet", () => {
    vi.mocked(usePermissions).mockReturnValue({ isAdmin: true } as any);
    vi.mocked(useLeaveBalanceForm).mockReturnValue(mockForm as any);
    vi.mocked(useLeaveBalances).mockReturnValue({ ...mockBalances, balances: [] } as any);
    render(<LeaveBalancesPage />);
    expect(screen.getByTestId("data-table")).toBeInTheDocument();
    expect(screen.queryByTestId("error")).not.toBeInTheDocument();
  });

  it("renders data table", () => {
    vi.mocked(usePermissions).mockReturnValue({ isAdmin: true } as any);
    vi.mocked(useLeaveBalanceForm).mockReturnValue(mockForm as any);
    vi.mocked(useLeaveBalances).mockReturnValue(mockBalances as any);
    render(<LeaveBalancesPage />);
    expect(screen.getByTestId("data-table")).toBeInTheDocument();
    expect(screen.getByText("Add Balance")).toBeInTheDocument();
  });
});
