import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PayrollSettingsPage } from "./PayrollSettingsPage";
import * as payrollService from "../services/payrollService";
import * as usePluginPermissions from "@/hooks/usePluginPermissions";
import type { PayrollRuleSet } from "../types";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual };
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

const mockConfig = {
  id: 1,
  currency: "ALL",
  country: "AL",
  default_tax_profile: "progressive",
  rounding_mode: "half_up",
  rounding_precision: 0,
  weekday_standby_hourly_rate: "100",
  weekend_standby_hourly_rate: "150",
  monthly_hours_strategy: "fixed_174",
  default_workday_hours: "8",
  only_approved_entries: false,
  require_tl_closed_before_finalize: false,
  overtime_is_taxable: true,
  standby_is_taxable: true,
  overtime_is_contribution_bearing: true,
  standby_is_contribution_bearing: true,
  missing_timestamp_fallback_category: "weekday_day",
  organization_name: "Test Org",
  payslip_footer: "",
  rules_source_label: "",
  rules_validation_status: "reference",
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

const mockRuleSet: PayrollRuleSet = {
  id: 1,
  code: "AL_2026_BOSHTI_REFERENCE",
  name: "Boshti Reference",
  version: "1.0",
  country: "AL",
  effective_from: "2026-01-01",
  effective_to: null,
  is_active: true,
  tax_profile: "progressive",
  source: "Boshti 2026",
  notes: "",
  validation_status: "reference",
  has_payroll_runs: false,
  effective_status: "current",
  tax_brackets: [],
  contribution_rates: [],
  overtime_categories: [],
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(usePluginPermissions.usePluginPermissions).mockReturnValue({
    canManage: () => false,
    canView: () => true,
    canConfigure: () => true,
    canExport: () => false,
    permissions: [],
    hasPermission: () => false,
    error: null,
    isLoading: false,
  });
});

describe("PayrollSettingsPage", () => {
  it("renders loading state", () => {
    vi.spyOn(payrollService.payrollService, "getConfiguration").mockReturnValue(
      new Promise(() => {}) as any
    );
    vi.spyOn(payrollService.payrollService, "getRuleSets").mockResolvedValue([]);
    vi.spyOn(payrollService.payrollService, "getConfigurationChoices").mockResolvedValue({
      currency: [{ value: "ALL", label: "Albanian Lek" }],
      rounding_mode: [{ value: "half_up", label: "Round half up" }],
      monthly_hours_strategy: [{ value: "fixed_174", label: "Fixed 174 hours/month" }],
      missing_timestamp_fallback_category: [{ value: "weekday_day", label: "Weekday daytime" }],
    });
    render(
      <MemoryRouter>
        <PayrollSettingsPage />
      </MemoryRouter>,
      { wrapper }
    );
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders error state", async () => {
    vi.spyOn(payrollService.payrollService, "getConfiguration").mockRejectedValue(
      new Error("fail")
    );
    vi.spyOn(payrollService.payrollService, "getRuleSets").mockResolvedValue([]);
    vi.spyOn(payrollService.payrollService, "getConfigurationChoices").mockResolvedValue({
      currency: [{ value: "ALL", label: "Albanian Lek" }],
      rounding_mode: [{ value: "half_up", label: "Round half up" }],
      monthly_hours_strategy: [{ value: "fixed_174", label: "Fixed 174 hours/month" }],
      missing_timestamp_fallback_category: [{ value: "weekday_day", label: "Weekday daytime" }],
    });
    render(
      <MemoryRouter>
        <PayrollSettingsPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByText("Failed to load configuration")).toBeInTheDocument();
    });
  });

  it("renders configuration form", async () => {
    vi.spyOn(payrollService.payrollService, "getConfiguration").mockResolvedValue(mockConfig);
    vi.spyOn(payrollService.payrollService, "getRuleSets").mockResolvedValue([]);
    vi.spyOn(payrollService.payrollService, "getConfigurationChoices").mockResolvedValue({
      currency: [{ value: "ALL", label: "Albanian Lek" }],
      rounding_mode: [{ value: "half_up", label: "Round half up" }],
      monthly_hours_strategy: [{ value: "fixed_174", label: "Fixed 174 hours/month" }],
      missing_timestamp_fallback_category: [{ value: "weekday_day", label: "Weekday daytime" }],
    });
    render(
      <MemoryRouter>
        <PayrollSettingsPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByText("Organization & Payroll Defaults")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Test Org")).toBeInTheDocument();
      expect(screen.getByText("Albanian Lek")).toBeInTheDocument();
    });
    expect(screen.getAllByRole("switch")).toHaveLength(6);
  });

  it("renders rule sets", async () => {
    vi.spyOn(payrollService.payrollService, "getConfiguration").mockResolvedValue(mockConfig);
    vi.spyOn(payrollService.payrollService, "getRuleSets").mockResolvedValue([mockRuleSet]);
    vi.spyOn(payrollService.payrollService, "getConfigurationChoices").mockResolvedValue({
      currency: [{ value: "ALL", label: "Albanian Lek" }],
      rounding_mode: [{ value: "half_up", label: "Round half up" }],
      monthly_hours_strategy: [{ value: "fixed_174", label: "Fixed 174 hours/month" }],
      missing_timestamp_fallback_category: [{ value: "weekday_day", label: "Weekday daytime" }],
    });
    render(
      <MemoryRouter>
        <PayrollSettingsPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByText("Boshti Reference")).toBeInTheDocument();
    });
  });

  it("hides superseded rule sets by default and shows toggle", async () => {
    vi.spyOn(payrollService.payrollService, "getConfiguration").mockResolvedValue(mockConfig);
    vi.spyOn(payrollService.payrollService, "getRuleSets").mockResolvedValue([
      { ...mockRuleSet, id: 1, code: "CURRENT_RS", effective_status: "current" },
      { ...mockRuleSet, id: 2, code: "UPCOMING_RS", effective_status: "upcoming" },
      { ...mockRuleSet, id: 3, code: "SUPERSEDED_RS", effective_status: "superseded" },
      {
        ...mockRuleSet,
        id: 4,
        code: "INACTIVE_RS",
        effective_status: "inactive",
        is_active: false,
      },
    ]);
    vi.spyOn(payrollService.payrollService, "getConfigurationChoices").mockResolvedValue({
      currency: [{ value: "ALL", label: "Albanian Lek" }],
      rounding_mode: [{ value: "half_up", label: "Round half up" }],
      monthly_hours_strategy: [{ value: "fixed_174", label: "Fixed 174 hours/month" }],
      missing_timestamp_fallback_category: [{ value: "weekday_day", label: "Weekday daytime" }],
    });
    render(
      <MemoryRouter>
        <PayrollSettingsPage />
      </MemoryRouter>,
      { wrapper }
    );
    // Current, Upcoming, Inactive are visible by default.
    await waitFor(() => {
      expect(screen.getByText("Current today")).toBeInTheDocument();
      expect(screen.getByText("Upcoming")).toBeInTheDocument();
      expect(screen.getByText("Inactive")).toBeInTheDocument();
      expect(
        screen.getByText(
          /Payroll runs use the rule set effective on the first day of the selected month/
        )
      ).toBeInTheDocument();
    });
    // Superseded is hidden by default.
    expect(screen.queryByText("Superseded")).not.toBeInTheDocument();
    // The superseded rule set's code is not shown.
    expect(screen.queryByText(/SUPERSEDED_RS/)).not.toBeInTheDocument();
    // Toggle is visible with count.
    expect(screen.getByText(/Show superseded/)).toBeInTheDocument();
  });

  it("reveals superseded rule sets when toggle is enabled", async () => {
    vi.spyOn(payrollService.payrollService, "getConfiguration").mockResolvedValue(mockConfig);
    vi.spyOn(payrollService.payrollService, "getRuleSets").mockResolvedValue([
      { ...mockRuleSet, id: 1, code: "CURRENT_RS", effective_status: "current" },
      { ...mockRuleSet, id: 3, code: "SUPERSEDED_RS", effective_status: "superseded" },
    ]);
    vi.spyOn(payrollService.payrollService, "getConfigurationChoices").mockResolvedValue({
      currency: [{ value: "ALL", label: "Albanian Lek" }],
      rounding_mode: [{ value: "half_up", label: "Round half up" }],
      monthly_hours_strategy: [{ value: "fixed_174", label: "Fixed 174 hours/month" }],
      missing_timestamp_fallback_category: [{ value: "weekday_day", label: "Weekday daytime" }],
    });
    render(
      <MemoryRouter>
        <PayrollSettingsPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByText("Current today")).toBeInTheDocument();
    });
    expect(screen.queryByText("Superseded")).not.toBeInTheDocument();

    // Enable the toggle.
    fireEvent.click(screen.getByRole("switch", { name: /Show superseded/ }));

    // Now the superseded badge and its code appear.
    await waitFor(() => {
      expect(screen.getByText("Superseded")).toBeInTheDocument();
      expect(screen.getByText(/SUPERSEDED_RS/)).toBeInTheDocument();
    });
  });

  it("does not show superseded toggle when there are no superseded sets", async () => {
    vi.spyOn(payrollService.payrollService, "getConfiguration").mockResolvedValue(mockConfig);
    vi.spyOn(payrollService.payrollService, "getRuleSets").mockResolvedValue([
      { ...mockRuleSet, id: 1, code: "ONLY_CURRENT", effective_status: "current" },
    ]);
    vi.spyOn(payrollService.payrollService, "getConfigurationChoices").mockResolvedValue({
      currency: [{ value: "ALL", label: "Albanian Lek" }],
      rounding_mode: [{ value: "half_up", label: "Round half up" }],
      monthly_hours_strategy: [{ value: "fixed_174", label: "Fixed 174 hours/month" }],
      missing_timestamp_fallback_category: [{ value: "weekday_day", label: "Weekday daytime" }],
    });
    render(
      <MemoryRouter>
        <PayrollSettingsPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByText("Current today")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Show superseded/)).not.toBeInTheDocument();
  });

  it("hides save button when permission denied", async () => {
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
    vi.spyOn(payrollService.payrollService, "getConfiguration").mockResolvedValue(mockConfig);
    vi.spyOn(payrollService.payrollService, "getRuleSets").mockResolvedValue([]);
    vi.spyOn(payrollService.payrollService, "getConfigurationChoices").mockResolvedValue({
      currency: [{ value: "ALL", label: "Albanian Lek" }],
      rounding_mode: [{ value: "half_up", label: "Round half up" }],
      monthly_hours_strategy: [{ value: "fixed_174", label: "Fixed 174 hours/month" }],
      missing_timestamp_fallback_category: [{ value: "weekday_day", label: "Weekday daytime" }],
    });
    render(
      <MemoryRouter>
        <PayrollSettingsPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.queryByText("Save Changes")).not.toBeInTheDocument();
    });
  });

  it("shows edit and version actions for an unused rule set", async () => {
    vi.spyOn(payrollService.payrollService, "getConfiguration").mockResolvedValue(mockConfig);
    vi.spyOn(payrollService.payrollService, "getRuleSets").mockResolvedValue([mockRuleSet]);
    vi.spyOn(payrollService.payrollService, "getConfigurationChoices").mockResolvedValue({
      currency: [{ value: "ALL", label: "Albanian Lek" }],
      rounding_mode: [{ value: "half_up", label: "Round half up" }],
      monthly_hours_strategy: [{ value: "fixed_174", label: "Fixed 174 hours/month" }],
      missing_timestamp_fallback_category: [{ value: "weekday_day", label: "Weekday daytime" }],
    });
    render(
      <MemoryRouter>
        <PayrollSettingsPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Edit calculation" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Create updated version" })).toBeInTheDocument();
    });
  });

  it("disables all configuration inputs without configure permission", async () => {
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
    vi.spyOn(payrollService.payrollService, "getConfiguration").mockResolvedValue(mockConfig);
    vi.spyOn(payrollService.payrollService, "getRuleSets").mockResolvedValue([]);
    vi.spyOn(payrollService.payrollService, "getConfigurationChoices").mockResolvedValue({
      currency: [{ value: "ALL", label: "Albanian Lek" }],
      rounding_mode: [{ value: "half_up", label: "Round half up" }],
      monthly_hours_strategy: [{ value: "fixed_174", label: "Fixed 174 hours/month" }],
      missing_timestamp_fallback_category: [{ value: "weekday_day", label: "Weekday daytime" }],
    });
    render(
      <MemoryRouter>
        <PayrollSettingsPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Organization Name")).toBeDisabled();
      expect(screen.getByLabelText("Weekday Standby Rate (Lek/hour)")).toBeDisabled();
      expect(screen.getByLabelText("Weekend Standby Rate (Lek/hour)")).toBeDisabled();
      expect(screen.getByLabelText("Payslip Footer")).toBeDisabled();
    });
  });

  it("shows error for negative standby rate", async () => {
    vi.spyOn(payrollService.payrollService, "getConfiguration").mockResolvedValue({
      ...mockConfig,
      weekday_standby_hourly_rate: "-50",
    });
    vi.spyOn(payrollService.payrollService, "getRuleSets").mockResolvedValue([]);
    vi.spyOn(payrollService.payrollService, "getConfigurationChoices").mockResolvedValue({
      currency: [{ value: "ALL", label: "Albanian Lek" }],
      rounding_mode: [{ value: "half_up", label: "Round half up" }],
      monthly_hours_strategy: [{ value: "fixed_174", label: "Fixed 174 hours/month" }],
      missing_timestamp_fallback_category: [{ value: "weekday_day", label: "Weekday daytime" }],
    });
    render(
      <MemoryRouter>
        <PayrollSettingsPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByText("Weekday rate cannot be negative.")).toBeInTheDocument();
    });
  });

  it("shows error for negative weekend standby rate", async () => {
    vi.spyOn(payrollService.payrollService, "getConfiguration").mockResolvedValue({
      ...mockConfig,
      weekend_standby_hourly_rate: "-50",
    });
    vi.spyOn(payrollService.payrollService, "getRuleSets").mockResolvedValue([]);
    vi.spyOn(payrollService.payrollService, "getConfigurationChoices").mockResolvedValue({
      currency: [{ value: "ALL", label: "Albanian Lek" }],
      rounding_mode: [{ value: "half_up", label: "Round half up" }],
      monthly_hours_strategy: [{ value: "fixed_174", label: "Fixed 174 hours/month" }],
      missing_timestamp_fallback_category: [{ value: "weekday_day", label: "Weekday daytime" }],
    });
    render(
      <MemoryRouter>
        <PayrollSettingsPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByText("Weekend rate cannot be negative.")).toBeInTheDocument();
    });
  });

  it("disables save button when standby rate is negative", async () => {
    vi.spyOn(payrollService.payrollService, "getConfiguration").mockResolvedValue({
      ...mockConfig,
      weekday_standby_hourly_rate: "-50",
    });
    vi.spyOn(payrollService.payrollService, "getRuleSets").mockResolvedValue([]);
    vi.spyOn(payrollService.payrollService, "getConfigurationChoices").mockResolvedValue({
      currency: [{ value: "ALL", label: "Albanian Lek" }],
      rounding_mode: [{ value: "half_up", label: "Round half up" }],
      monthly_hours_strategy: [{ value: "fixed_174", label: "Fixed 174 hours/month" }],
      missing_timestamp_fallback_category: [{ value: "weekday_day", label: "Weekday daytime" }],
    });
    render(
      <MemoryRouter>
        <PayrollSettingsPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByText("Save Changes")).toBeDisabled();
    });
  });
});
