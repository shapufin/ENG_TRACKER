import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PayrollRunsPage } from "./PayrollRunsPage";
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
  vi.spyOn(payrollService.payrollService, "getRuns").mockResolvedValue([]);
});

// Phase 6 mechanical rollout: scroll contract + description on the create dialog.
describe("PayrollRunsPage create dialog", () => {
  it("keeps the scroll contract with a description", async () => {
    render(
      <MemoryRouter>
        <PayrollRunsPage />
      </MemoryRouter>,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "New Payroll Run" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "New Payroll Run" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Start a new payroll run for a processing period.")
    ).toBeInTheDocument();
    expect(dialog.className).toContain("flex-col");
    expect(dialog.className).toContain("overflow-hidden");
    expect(dialog.querySelector(".flex-1.overflow-y-auto")).not.toBeNull();
    expect(within(dialog).getByLabelText("Year")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Month")).toBeInTheDocument();
  });
});
