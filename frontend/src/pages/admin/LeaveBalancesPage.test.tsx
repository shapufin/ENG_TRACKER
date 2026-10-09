import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LeaveBalancesPage } from "./LeaveBalancesPage";

vi.mock("@/context/PermissionContext", () => ({ usePermissions: vi.fn() }));
vi.mock("@/hooks/useLeaveBalances", () => ({ useLeaveBalances: vi.fn() }));
vi.mock("./hooks/useLeaveBalanceForm", () => ({ useLeaveBalanceForm: vi.fn() }));
vi.mock("./hooks/useLeaveBalanceColumns", () => ({ useLeaveBalanceColumns: vi.fn() }));
vi.mock("@/components/ui/DataTable", () => ({
  DataTable: ({ data, toolbarActions }: { data: unknown[]; toolbarActions?: React.ReactNode }) => (
    <div>
      {toolbarActions}
      <div data-testid="data-table" data-rows={data.length} />
    </div>
  ),
}));
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
const setParams = vi.fn();
let currentParams = new URLSearchParams();
vi.mock("react-router-dom", () => ({
  Navigate: ({ to }: any) => <div data-testid="navigate">{to}</div>,
  useSearchParams: () => [currentParams, setParams],
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
  beforeEach(() => {
    currentParams = new URLSearchParams();
    setParams.mockClear();
  });

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

  describe("expiring carry-over filter", () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 10);
    const late = new Date();
    late.setDate(late.getDate() + 200);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const rows = [
      { id: 1, user_name: "Soon", is_carry_over: true, expires_at: iso(soon), available_days: 2 },
      { id: 2, user_name: "Late", is_carry_over: true, expires_at: iso(late), available_days: 2 },
      { id: 3, user_name: "Plain", is_carry_over: false, expires_at: null, available_days: 5 },
    ];
    const setup = () => {
      vi.mocked(usePermissions).mockReturnValue({ isAdmin: true } as any);
      vi.mocked(useLeaveBalanceForm).mockReturnValue(mockForm as any);
      vi.mocked(useLeaveBalances).mockReturnValue({ ...mockBalances, balances: rows } as any);
    };

    it("shows every row by default with the toggle off", () => {
      setup();
      render(<LeaveBalancesPage />);
      expect(screen.getByTestId("data-table")).toHaveAttribute("data-rows", "3");
      expect(screen.getByRole("button", { name: /expiring/i })).toHaveAttribute(
        "aria-pressed",
        "false"
      );
    });

    it("filters to expiring rows when ?expiring=1", () => {
      setup();
      currentParams = new URLSearchParams("expiring=1");
      render(<LeaveBalancesPage />);
      expect(screen.getByTestId("data-table")).toHaveAttribute("data-rows", "1");
      expect(screen.getByRole("button", { name: /expiring/i })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
    });

    it("toggling writes the URL param and keeps others", () => {
      setup();
      currentParams = new URLSearchParams("foo=1");
      render(<LeaveBalancesPage />);
      fireEvent.click(screen.getByRole("button", { name: /expiring/i }));
      const next = setParams.mock.calls[0][0] as URLSearchParams;
      expect(next.get("expiring")).toBe("1");
      expect(next.get("foo")).toBe("1");
    });
  });
});
