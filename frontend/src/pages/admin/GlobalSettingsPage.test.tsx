import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { leaveService } from "@/services/leaveService";
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

  it("submits the carry-over month chosen in the month select as a number", async () => {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.scrollIntoView = () => {};
    vi.mocked(leaveService.updateSettings).mockResolvedValue({} as never);
    renderPage();

    const month = await screen.findByLabelText("Carry-over Expiry Month");
    expect(month).toHaveTextContent("March");
    fireEvent.keyDown(month, { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "March" }));
    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(() => expect(leaveService.updateSettings).toHaveBeenCalled());
    expect(vi.mocked(leaveService.updateSettings).mock.calls[0][0]).toEqual({
      default_yearly_leave_days: 21,
      carry_over_expiry_month: 3,
      carry_over_expiry_day: 31,
    });
  });

  it("opens the hidden logo input from a Choose file button and shows the file name", async () => {
    vi.mocked(dashboardService.updateBranding).mockResolvedValue({
      id: 1, site_name: "Engineering Tracker", logo: null, logo_url: null,
    });
    renderPage();
    const input = (await screen.findByLabelText("Logo")) as HTMLInputElement;
    expect(input).toHaveClass("sr-only");
    expect(input.accept).toBe("image/png,image/jpeg,image/svg+xml,image/webp");
    expect(screen.getByText("No file chosen")).toBeInTheDocument();

    const clickSpy = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: /choose file/i }));
    expect(clickSpy).toHaveBeenCalled();

    const file = new File(["x"], "logo.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText("logo.png")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /save branding/i }));
    await waitFor(() =>
      expect(dashboardService.updateBranding).toHaveBeenCalledWith(1, "Engineering Tracker", file)
    );
  });
});
