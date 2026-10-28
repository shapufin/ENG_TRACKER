import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { leaveService } from "@/services/leaveService";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { GlobalSettingsPage } from "./GlobalSettingsPage";
import { dashboardService } from "@/services/dashboardService";

vi.mock("@/services/leaveService", () => ({
  leaveService: {
    getSettings: vi.fn().mockResolvedValue({
      default_yearly_leave_days: 21,
      carry_over_expiry_month: 3,
      carry_over_expiry_day: 31,
      carry_over_enabled: true,
      carry_over_applied_year: null,
      business_timezone: "Europe/Tirane",
      mfa_required: false,
    }),
    updateSettings: vi.fn(),
  },
}));

vi.mock("@/services/dashboardService", () => ({
  dashboardService: {
    getBranding: vi.fn().mockResolvedValue({
      id: 1,
      site_name: "Engineering Tracker",
      logo: null,
      logo_url: null,
    }),
    updateBranding: vi.fn(),
  },
}));

vi.mock("@/hooks/useMaintenanceStatus", () => ({
  MAINTENANCE_STATUS_QUERY_KEY: ["maintenance-status"],
  useMaintenanceStatus: () => ({
    data: {
      active: false,
      title: "Scheduled maintenance",
      message: "We are updating the platform.",
      started_at: null,
      ends_at: null,
      updated_at: "2026-10-27T20:00:00Z",
      site_name: "Engineering Tracker",
      logo_url: null,
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

// Radix Switch measures itself with ResizeObserver, which jsdom does not provide.
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(window, "ResizeObserver", { value: ResizeObserverMock, writable: true });

const activePlugins = vi.hoisted(() => ({ value: [] as { name: string }[] }));
vi.mock("@/context/PluginContext", () => ({
  usePlugins: () => ({ activePlugins: activePlugins.value }),
}));

const permissions = vi.hoisted(() => ({ isSuperuser: true }));
vi.mock("@/context/PermissionContext", () => ({
  usePermissions: () => ({ isSuperuser: permissions.isSuperuser }),
}));

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <GlobalSettingsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe("GlobalSettingsPage", () => {
  describe("company-wide two-factor requirement", () => {
    it("asks for confirmation, then saves only the requirement", async () => {
      permissions.isSuperuser = true;
      vi.mocked(leaveService.updateSettings).mockClear();
      vi.mocked(leaveService.updateSettings).mockResolvedValue({} as never);
      renderPage();

      fireEvent.click(await screen.findByLabelText("Require two-factor for all users"));
      expect(leaveService.updateSettings).not.toHaveBeenCalled();
      fireEvent.click(await screen.findByRole("button", { name: "Require for everyone" }));

      await waitFor(() =>
        expect(leaveService.updateSettings).toHaveBeenCalledWith({ mfa_required: true })
      );
    });

    it("cancelling the confirmation changes nothing", async () => {
      permissions.isSuperuser = true;
      vi.mocked(leaveService.updateSettings).mockClear();
      renderPage();

      fireEvent.click(await screen.findByLabelText("Require two-factor for all users"));
      fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
      expect(leaveService.updateSettings).not.toHaveBeenCalled();
    });

    it("is read-only for staff who are not superusers", async () => {
      permissions.isSuperuser = false;
      renderPage();
      expect(await screen.findByLabelText("Require two-factor for all users")).toBeDisabled();
      expect(screen.getByText(/Only a superuser can change this/)).toBeInTheDocument();
      permissions.isSuperuser = true;
    });
  });

  it("associates setting labels with their inputs", async () => {
    // Audit 2026-09-07: <Label> had no htmlFor / inputs no id — the three
    // vacation-policy inputs had no programmatic accessible name.
    renderPage();
    expect(await screen.findByLabelText("Default Yearly Vacation Days")).toBeInTheDocument();
    expect(screen.getByLabelText("Carry-over Expiry Month")).toBeInTheDocument();
    expect(screen.getByLabelText("Carry-over Expiry Day")).toBeInTheDocument();
    expect(screen.getByLabelText("Business timezone")).toBeInTheDocument();
  });

  it("shows the stored business timezone and submits a changed one", async () => {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.scrollIntoView = () => {};
    vi.mocked(leaveService.updateSettings).mockResolvedValue({} as never);
    renderPage();

    const zone = await screen.findByLabelText("Business timezone");
    expect(zone).toHaveTextContent("Europe/Tirane");
    fireEvent.keyDown(zone, { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "Europe/Rome" }));
    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(() => expect(leaveService.updateSettings).toHaveBeenCalled());
    expect(vi.mocked(leaveService.updateSettings).mock.calls.at(-1)?.[0]).toMatchObject({
      business_timezone: "Europe/Rome",
    });
  }, 20_000); // ~420 zone options render in jsdom; headroom for full-suite load

  it("renders and submits the site branding form", async () => {
    vi.mocked(dashboardService.updateBranding).mockResolvedValue({
      id: 1,
      site_name: "New Name",
      logo: null,
      logo_url: null,
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
      carry_over_enabled: true,
      business_timezone: "Europe/Tirane",
    });
  }, 20_000);

  it("opens the hidden logo input from a Choose file button and shows the file name", async () => {
    vi.mocked(dashboardService.updateBranding).mockResolvedValue({
      id: 1,
      site_name: "Engineering Tracker",
      logo: null,
      logo_url: null,
    });
    renderPage();
    const input = (await screen.findByLabelText("Logo")) as HTMLInputElement;
    expect(input).toHaveClass("sr-only");
    expect(input.accept).toBe("image/png,image/jpeg,image/webp");
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

  it("hides the audit log link while the audit_log plugin is inactive", async () => {
    activePlugins.value = [];
    renderPage();
    await screen.findByText("Plugin Architecture");
    expect(screen.queryByText(/Security & Audit Logs/)).toBeNull();
  });

  it("shows the audit log link when the audit_log plugin is active", async () => {
    activePlugins.value = [{ name: "audit_log" }];
    renderPage();
    expect(await screen.findByText(/Security & Audit Logs/)).toBeTruthy();
  });

  it("opens the maintenance tab from the admin banner link", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("tab", { name: /Maintenance/ }));

    expect(await screen.findByLabelText("Put the site into maintenance mode")).toBeInTheDocument();
  });
});
