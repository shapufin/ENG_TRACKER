import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PayrollWagesPage } from "./PayrollWagesPage";
import * as payrollService from "../services/payrollService";
import * as usePluginPermissions from "@/hooks/usePluginPermissions";

vi.mock("@/hooks/usePluginPermissions", () => ({
  usePluginPermissions: vi.fn(),
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

const mockEligibleUsers = [
  { id: 2, username: "jdoe", full_name: "John Doe", has_active_wage: true, current_wage: "100000" },
  {
    id: 3,
    username: "asmith",
    full_name: "Alice Smith",
    has_active_wage: false,
    current_wage: null,
  },
];

const openAssignForm = async () => {
  render(
    <MemoryRouter>
      <PayrollWagesPage />
    </MemoryRouter>,
    { wrapper }
  );
  await waitFor(() => {
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
  });
  // DataTable renders desktop + mobile duplicates — either opens the same form.
  fireEvent.click(screen.getAllByRole("button", { name: "Assign Wage" })[0]);
  await waitFor(() => {
    expect(
      screen.getByText("Set the authoritative base monthly salary for payroll runs.")
    ).toBeInTheDocument();
  });
  return within(screen.getByRole("dialog"));
};

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
  // John (id 2) has an active wage so only Alice shows "Assign Wage".
  vi.spyOn(payrollService.payrollService, "getWages").mockResolvedValue([
    { id: 1, user: 2, is_active: true } as never,
  ]);
});

describe("PayrollWagesPage assign dialog (mockup AssignWage pattern)", () => {
  it("member chip shows the employee full name and username", async () => {
    const dialog = await openAssignForm();
    expect(dialog.getByText("Alice Smith")).toBeInTheDocument();
    expect(dialog.getByText("@asmith")).toBeInTheDocument();
  });

  it("wage input keeps its label and shows the Lek affix", async () => {
    const dialog = await openAssignForm();
    expect(dialog.getByLabelText(/gross monthly wage/i)).toBeInTheDocument();
    expect(dialog.getByText("Lek / mo")).toBeInTheDocument();
  });

  it("keeps effective dates and note fields", async () => {
    const dialog = await openAssignForm();
    expect(dialog.getByLabelText(/start date/i)).toBeInTheDocument();
    expect(dialog.getByLabelText(/effective to/i)).toBeInTheDocument();
    expect(dialog.getByLabelText(/note/i)).toBeInTheDocument();
  });
});
