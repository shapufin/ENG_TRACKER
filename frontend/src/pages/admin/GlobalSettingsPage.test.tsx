import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GlobalSettingsPage } from "./GlobalSettingsPage";
import { dashboardService } from "@/services/dashboardService";

vi.mock("@/services/leaveService", () => ({
  leaveService: {
    getSettings: vi.fn().mockResolvedValue({
      default_yearly_leave_days: 21,
      carry_over_expiry_month: 3,
      carry_over_expiry_day: 31,
    }),
    updateSettings: vi.fn(),
  },
}));

vi.mock("@/services/dashboardService", () => ({
  dashboardService: {
    getBranding: vi.fn().mockResolvedValue({
      id: 1, site_name: "Engineering Tracker", logo: null, logo_url: null,
    }),
    updateBranding: vi.fn(),
  },
}));

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <GlobalSettingsPage />
    </QueryClientProvider>
  );
};

describe("GlobalSettingsPage", () => {
  it("associates setting labels with their inputs", async () => {
    // Audit 2026-09-07: <Label> had no htmlFor / inputs no id — the three
    // vacation-policy inputs had no programmatic accessible name.
    renderPage();
    expect(await screen.findByLabelText("Default Yearly Vacation Days")).toBeInTheDocument();
    expect(screen.getByLabelText("Carry-over Expiry Month")).toBeInTheDocument();
    expect(screen.getByLabelText("Carry-over Expiry Day")).toBeInTheDocument();
  });

  it("renders and submits the site branding form", async () => {
    vi.mocked(dashboardService.updateBranding).mockResolvedValue({
      id: 1, site_name: "New Name", logo: null, logo_url: null,
    });
    renderPage();

    const nameInput = await screen.findByLabelText("Site Name");
    expect(nameInput).toHaveValue("Engineering Tracker");

    fireEvent.change(nameInput, { target: { value: "New Name" } });
    fireEvent.click(screen.getByRole("button", { name: /save branding/i }));

    await waitFor(() =>
      expect(dashboardService.updateBranding).toHaveBeenCalledWith(1, "New Name", null)
    );
  });
});
