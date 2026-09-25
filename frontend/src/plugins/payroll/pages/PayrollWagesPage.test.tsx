import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PayrollWagesPage } from "./PayrollWagesPage";
import * as payrollService from "../services/payrollService";
import * as usePluginPermissions from "@/hooks/usePluginPermissions";
import { exportData } from "@/utils/exportUtils";

vi.mock("@/hooks/usePluginPermissions", () => ({
  usePluginPermissions: vi.fn(),
}));

// PluginImportButton reads the active-plugin list; with data_import inactive
// it renders nothing (the path taken when the plugin is disabled or removed).
vi.mock("@/context/PluginContext", () => ({
  usePlugins: () => ({ activePlugins: [], isLoading: false }),
}));

vi.mock("@/utils/exportUtils", () => ({
  exportData: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/error-handler", () => ({
  handleApiError: vi.fn(),
}));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const mockWage = {
  id: 1,
  user: 2,
  user_name: "jdoe",
  user_full_name: "John Doe",
  gross_monthly_wage: "100000",
  effective_from: "2026-01-01",
  effective_to: null,
  note: "Initial wage",
  is_active: true,
  created_by: 1,
  created_by_name: "admin",
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

const mockEligibleUsers = [
  {
    id: 2,
    username: "jdoe",
    full_name: "John Doe",
    has_active_wage: true,
    current_wage: "100000",
  },
  {
    id: 3,
    username: "asmith",
    full_name: "Alice Smith",
    has_active_wage: false,
    current_wage: null,
  },
];

const renderPage = () =>
  render(
    <MemoryRouter>
      <PayrollWagesPage />
    </MemoryRouter>,
    { wrapper }
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.mocked(usePluginPermissions.usePluginPermissions).mockReturnValue({
    canManage: () => true,
    canView: () => true,
    canConfigure: () => false,
    canExport: () => false,
    permissions: [],
    hasPermission: () => false,
    error: null,
    isLoading: false,
  });
  vi.spyOn(payrollService.payrollService, "getEligibleUsers").mockResolvedValue(mockEligibleUsers);
  vi.spyOn(payrollService.payrollService, "getWages").mockResolvedValue([mockWage]);
  vi.spyOn(payrollService.payrollService, "createWage").mockResolvedValue(mockWage);
  vi.spyOn(payrollService.payrollService, "updateWage").mockResolvedValue(mockWage);
  vi.spyOn(payrollService.payrollService, "deleteWage").mockResolvedValue();
});

describe("PayrollWagesPage", () => {
  it("renders loading state while the employee roster is loading", () => {
    vi.spyOn(payrollService.payrollService, "getEligibleUsers").mockReturnValue(
      new Promise(() => {}) as any
    );
    renderPage();
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders every eligible employee with assigned or missing wage status", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("John Doe")).toBeInTheDocument();
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
      expect(screen.getByText("100,000 Lek")).toBeInTheDocument();
      expect(screen.getByText("Assigned")).toBeInTheDocument();
      expect(screen.getByText("Missing wage")).toBeInTheDocument();
      expect(screen.getByText("Not assigned")).toBeInTheDocument();
    });
  });

  it("renders wage status as semantic pills (emerald assigned, amber missing — rose is reserved for errors)", async () => {
    renderPage();

    await waitFor(() => {
      const assigned = screen.getByLabelText("Assigned", { selector: '[role="status"]' });
      expect(assigned.className).toContain("bg-success/10");
      const missing = screen.getByLabelText("Missing wage", { selector: '[role="status"]' });
      expect(missing.className).toContain("bg-warning/10");
      expect(missing.className).not.toContain("bg-destructive/10");
    });
  });

  it("opens an assignment form for the selected employee without asking for a user", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Assign Wage" }));

    expect(screen.getByRole("heading", { name: "Assign Wage" })).toBeInTheDocument();
    expect(screen.getAllByText("@asmith").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByLabelText("User ID")).not.toBeInTheDocument();
  });

  it("creates a wage for the employee whose row was selected", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Assign Wage"));
    fireEvent.change(screen.getByLabelText("Gross Monthly Wage (Lek)"), {
      target: { value: "120000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Assign Wage" }));

    await waitFor(() => {
      expect(payrollService.payrollService.createWage).toHaveBeenCalledWith(
        expect.objectContaining({
          user: 3,
          gross_monthly_wage: "120000",
          is_active: true,
        })
      );
    });
  });

  it("opens the edit form for an assigned employee", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText("John Doe")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Edit"));

    expect(screen.getByText("Edit Wage Assignment")).toBeInTheDocument();
    expect(screen.getByDisplayValue("100000")).toBeInTheDocument();
  });

  it("offers a CSV of employees missing a wage", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());
    const button = screen.getByRole("button", { name: "Download CSV" });
    expect(button).toBeEnabled();

    fireEvent.click(button);

    expect(exportData).toHaveBeenCalledTimes(1);
    type ExportCall = [
      Array<{ username: string; full_name: string }>,
      string,
      "csv",
      {
        headers: string[];
        rowMapper: (item: { username: string; full_name: string }) => string[];
      },
    ];
    const [data, filename, format, config] = vi.mocked(exportData).mock
      .calls[0] as unknown as ExportCall;

    expect(filename).toBe("wages_missing");
    expect(format).toBe("csv");
    expect(config.headers).toEqual([
      "username",
      "full_name",
      "gross_monthly_wage",
      "effective_from",
      "effective_to",
      "note",
    ]);
    expect(data).toHaveLength(1);
    expect(data[0].username).toBe("asmith");

    const mapped = config.rowMapper(data[0]);
    expect(mapped[0]).toBe("asmith");
    expect(mapped[1]).toBe("Alice Smith");
    expect(mapped[2]).toBe("");
    expect(mapped[3]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(mapped[4]).toBe("");
    expect(mapped[5]).toBe("");
  });

  it("disables the CSV download when every employee has a wage", async () => {
    vi.spyOn(payrollService.payrollService, "getWages").mockResolvedValue([
      mockWage,
      { ...mockWage, id: 2, user: 3, user_name: "asmith" },
    ]);
    renderPage();

    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    expect(exportData).not.toHaveBeenCalled();
  });

  it("hides management actions when permission is denied", async () => {
    vi.mocked(usePluginPermissions.usePluginPermissions).mockReturnValue({
      canManage: () => false,
      canView: () => true,
      canConfigure: () => false,
      canExport: () => false,
      permissions: [],
      hasPermission: () => false,
      error: null,
      isLoading: false,
    });
    renderPage();

    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());
    expect(screen.queryByText("Assign Wage")).not.toBeInTheDocument();
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
    expect(screen.queryByText("Download CSV")).not.toBeInTheDocument();
  });
});
