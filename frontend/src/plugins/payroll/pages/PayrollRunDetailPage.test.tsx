import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PayrollRunDetailPage } from "./PayrollRunDetailPage";
import * as payrollService from "../services/payrollService";
import * as usePluginPermissions from "@/hooks/usePluginPermissions";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useParams: () => ({ id: "1" }) };
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
  line_count: 3,
  created_by: 1,
  created_by_name: "admin",
  finalized_by: null,
  finalized_by_name: null,
  finalized_at: null,
  configuration_snapshot: {},
  totals: {
    total_gross: "300000",
    total_deductions: "60000",
    total_net: "240000",
    total_employer_cost: "360000",
    total_overtime: "0",
    total_standby: "0",
    line_count: 3,
  },
  notes: "",
  created_at: "2026-08-01",
  updated_at: "2026-08-01",
};

const mockFinalizedRun = { ...mockRun, status: "finalized" as const };

const mockClosureStatus = {
  period: "2026-07-01",
  all_closed: true,
  total_users: 3,
  closed_users: 3,
  unclosed_users: [],
  entries_without_source_closure: [],
  requires_tl_closed_before_finalize: true,
};

const mockLines = [
  {
    id: 1,
    user: 2,
    user_name: "jdoe",
    user_full_name: "John Doe",
    run: 1,
    wage_assignment: 1,
    gross_monthly_wage: "100000",
    monthly_working_days: 22,
    monthly_standard_hours: "174",
    overtime_hours: "0",
    overtime_amount: "0",
    standby_hours: "0",
    standby_amount: "0",
    total_gross: "100000",
    taxable_base: "100000",
    contribution_base: "100000",
    employee_social: "9500",
    employee_health: "1700",
    income_tax: "7644",
    total_employee_deductions: "18844",
    net_pay: "81156",
    employer_social: "16700",
    employer_health: "1700",
    total_employer_cost: "118400",
    overtime_breakdown: { categories: [] },
    calculation_trace: {},
    warnings: [],
    rule_set_version: "1.0",
    created_at: "2026-08-01",
    updated_at: "2026-08-01",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(usePluginPermissions.usePluginPermissions).mockReturnValue({
    canManage: () => true,
    canView: () => true,
    canConfigure: () => false,
    canExport: () => true,
    permissions: [],
    hasPermission: () => false,
    error: null,
    isLoading: false,
  });
  vi.spyOn(payrollService.payrollService, "generateLine").mockResolvedValue({
    status: "generated",
    line: mockLines[0] as any,
  });
  vi.spyOn(payrollService.payrollService, "getPeriodClosureStatus").mockResolvedValue(
    mockClosureStatus
  );
});

describe("PayrollRunDetailPage", () => {
  it("renders loading state", () => {
    vi.spyOn(payrollService.payrollService, "getRun").mockReturnValue(new Promise(() => {}) as any);
    vi.spyOn(payrollService.payrollService, "getRunLines").mockReturnValue(
      new Promise(() => {}) as any
    );
    render(
      <MemoryRouter>
        <PayrollRunDetailPage />
      </MemoryRouter>,
      { wrapper }
    );
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders error state", async () => {
    vi.spyOn(payrollService.payrollService, "getRun").mockRejectedValue(new Error("fail"));
    vi.spyOn(payrollService.payrollService, "getRunLines").mockResolvedValue([]);
    render(
      <MemoryRouter>
        <PayrollRunDetailPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByText("Failed to load payroll run")).toBeInTheDocument();
    });
  });

  it("renders draft run with generate and finalize buttons", async () => {
    vi.spyOn(payrollService.payrollService, "getRun").mockResolvedValue(mockRun);
    vi.spyOn(payrollService.payrollService, "getRunLines").mockResolvedValue(mockLines);
    render(
      <MemoryRouter>
        <PayrollRunDetailPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByText("Regenerate")).toBeInTheDocument();
      expect(screen.getByText("Finalize")).toBeInTheDocument();
    });
  });

  it("shows TL closure readiness for a draft run", async () => {
    vi.spyOn(payrollService.payrollService, "getRun").mockResolvedValue(mockRun);
    vi.spyOn(payrollService.payrollService, "getRunLines").mockResolvedValue(mockLines);
    render(
      <MemoryRouter>
        <PayrollRunDetailPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByText("All TL scopes closed")).toBeInTheDocument();
      expect(screen.getByText("3 of 3 users closed")).toBeInTheDocument();
    });
  });

  it("blocks finalization when required TL scopes are unclosed", async () => {
    vi.mocked(payrollService.payrollService.getPeriodClosureStatus).mockResolvedValue({
      ...mockClosureStatus,
      all_closed: false,
      closed_users: 2,
      unclosed_users: [{ id: 9, username: "late.user" }],
    });
    vi.spyOn(payrollService.payrollService, "getRun").mockResolvedValue(mockRun);
    vi.spyOn(payrollService.payrollService, "getRunLines").mockResolvedValue(mockLines);
    render(
      <MemoryRouter>
        <PayrollRunDetailPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByText("TL scopes unclosed")).toBeInTheDocument();
      expect(
        screen.getByText("Finalize is disabled until all team-leader scopes are closed.")
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Finalize" })).toBeDisabled();
    });
  });

  it("allows finalization with a closure warning when the rule is advisory", async () => {
    vi.mocked(payrollService.payrollService.getPeriodClosureStatus).mockResolvedValue({
      ...mockClosureStatus,
      all_closed: false,
      closed_users: 2,
      unclosed_users: [{ id: 9, username: "late.user" }],
      requires_tl_closed_before_finalize: false,
    });
    vi.spyOn(payrollService.payrollService, "getRun").mockResolvedValue(mockRun);
    vi.spyOn(payrollService.payrollService, "getRunLines").mockResolvedValue(mockLines);
    render(
      <MemoryRouter>
        <PayrollRunDetailPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Finalize" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Finalize" }));
    expect(await screen.findByText(/TL closure is incomplete for 1 user/)).toBeInTheDocument();
  });

  it("renders finalized run without generate/finalize buttons", async () => {
    vi.spyOn(payrollService.payrollService, "getRun").mockResolvedValue(mockFinalizedRun);
    vi.spyOn(payrollService.payrollService, "getRunLines").mockResolvedValue(mockLines);
    render(
      <MemoryRouter>
        <PayrollRunDetailPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.queryByText("Regenerate")).not.toBeInTheDocument();
      expect(screen.queryByText("Finalize")).not.toBeInTheDocument();
    });
  });

  it("renders summary cards with totals", async () => {
    vi.spyOn(payrollService.payrollService, "getRun").mockResolvedValue(mockRun);
    vi.spyOn(payrollService.payrollService, "getRunLines").mockResolvedValue(mockLines);
    render(
      <MemoryRouter>
        <PayrollRunDetailPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByText("Total Gross")).toBeInTheDocument();
      expect(screen.getByText("300,000")).toBeInTheDocument();
      expect(screen.getByText("Total Net Pay")).toBeInTheDocument();
      expect(screen.getByText("240,000")).toBeInTheDocument();
    });
  });

  it("renders employee breakdown table with lines", async () => {
    vi.spyOn(payrollService.payrollService, "getRun").mockResolvedValue(mockRun);
    vi.spyOn(payrollService.payrollService, "getRunLines").mockResolvedValue(mockLines);
    render(
      <MemoryRouter>
        <PayrollRunDetailPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByText("John Doe")).toBeInTheDocument();
      expect(screen.getByText("81,156")).toBeInTheDocument();
    });
  });

  it("shows export button when canExport", async () => {
    vi.spyOn(payrollService.payrollService, "getRun").mockResolvedValue(mockFinalizedRun);
    vi.spyOn(payrollService.payrollService, "getRunLines").mockResolvedValue(mockLines);
    render(
      <MemoryRouter>
        <PayrollRunDetailPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByText("Export Excel")).toBeInTheDocument();
    });
  });

  it("hides export button when cannot export", async () => {
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
    vi.spyOn(payrollService.payrollService, "getRun").mockResolvedValue(mockFinalizedRun);
    vi.spyOn(payrollService.payrollService, "getRunLines").mockResolvedValue(mockLines);
    render(
      <MemoryRouter>
        <PayrollRunDetailPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.queryByText("Export Excel")).not.toBeInTheDocument();
    });
  });
});
