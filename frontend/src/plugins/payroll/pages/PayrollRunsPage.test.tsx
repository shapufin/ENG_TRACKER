import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PayrollRunsPage } from "./PayrollRunsPage";
import * as payrollService from "../services/payrollService";
import * as usePluginPermissions from "@/hooks/usePluginPermissions";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/hooks/usePluginPermissions", () => ({
  usePluginPermissions: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/error-handler", () => ({
  handleApiError: vi.fn(),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const mockRun = {
  id: 1,
  year: 2026,
  month: 7,
  status: "draft" as const,
  rule_set: 1,
  rule_set_name: "Boshti Reference",
  line_count: 5,
  created_by: 1,
  created_by_name: "admin",
  finalized_by: null,
  finalized_by_name: null,
  finalized_at: null,
  configuration_snapshot: {},
  totals: {
    total_gross: "500000",
    total_deductions: "100000",
    total_net: "400000",
    total_employer_cost: "600000",
    total_overtime: "0",
    total_standby: "0",
    line_count: 5,
  },
  notes: "",
  created_at: "2026-08-01",
  updated_at: "2026-08-01",
};

beforeEach(() => {
  vi.clearAllMocks();
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
});

describe("PayrollRunsPage", () => {
  it("renders loading state", () => {
    vi.spyOn(payrollService.payrollService, "getRuns").mockReturnValue(
      new Promise(() => {}) as any
    );
    render(
      <MemoryRouter>
        <PayrollRunsPage />
      </MemoryRouter>,
      { wrapper }
    );
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders error state", async () => {
    vi.spyOn(payrollService.payrollService, "getRuns").mockRejectedValue(new Error("fail"));
    render(
      <MemoryRouter>
        <PayrollRunsPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByText("Failed to load payroll runs")).toBeInTheDocument();
    });
  });

  it("renders empty state", async () => {
    vi.spyOn(payrollService.payrollService, "getRuns").mockResolvedValue([]);
    render(
      <MemoryRouter>
        <PayrollRunsPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByText(/No payroll runs yet/)).toBeInTheDocument();
    });
  });

  it("renders runs from API", async () => {
    vi.spyOn(payrollService.payrollService, "getRuns").mockResolvedValue([mockRun]);
    render(
      <MemoryRouter>
        <PayrollRunsPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByText("2026-07")).toBeInTheDocument();
      expect(screen.getByText("Boshti Reference")).toBeInTheDocument();
    });
  });

  it("hides create button when permission denied", async () => {
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
    vi.spyOn(payrollService.payrollService, "getRuns").mockResolvedValue([]);
    render(
      <MemoryRouter>
        <PayrollRunsPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.queryByText("New Payroll Run")).not.toBeInTheDocument();
    });
  });

  it("navigates to run detail on row click", async () => {
    vi.spyOn(payrollService.payrollService, "getRuns").mockResolvedValue([mockRun]);
    render(
      <MemoryRouter>
        <PayrollRunsPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByText("2026-07")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("2026-07"));
    expect(mockNavigate).toHaveBeenCalledWith("/admin/payroll/runs/1");
  });
});
