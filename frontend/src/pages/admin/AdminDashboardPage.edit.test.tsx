import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { defaultAdminLayout } from "@/components/dashboard/widgetRegistry";
import { AdminDashboardPage } from "./AdminDashboardPage";

const ctx = vi.hoisted(() => ({
  updateLayout: vi.fn(),
  resetLayout: vi.fn(),
  retrySave: vi.fn(),
  saveStatus: "idle" as string,
  toast: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: Object.assign(ctx.toast, { info: vi.fn(), error: vi.fn() }) }));
vi.mock("@/context/DashboardContext", () => ({
  DashboardProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useDashboard: () => ({
    layout: defaultAdminLayout,
    isLoading: false,
    saveStatus: ctx.saveStatus,
    retrySave: ctx.retrySave,
    updateLayout: ctx.updateLayout,
    resetLayout: ctx.resetLayout,
  }),
}));
vi.mock("@/context/PermissionContext", () => ({ usePermissions: () => ({ isSuperuser: false }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 1, username: "admin" } }) }));
vi.mock("./components/AdminInsightsStrip", () => ({ AdminInsightsStrip: () => null }));
vi.mock("./components/AdminDashboardFreshness", () => ({ AdminDashboardFreshness: () => null }));
vi.mock("./hooks/useAdminDashboardPage", () => ({
  useAdminDashboardPage: () => ({
    resetLayout: ctx.resetLayout,
    customizeModalOpen: false,
    setCustomizeModalOpen: vi.fn(),
    isWidgetActive: () => true,
    handleToggleWidget: vi.fn(),
    activeWidgetIds: [],
    totalUsers: 0,
    totalTeams: 0,
    totalPending: 0,
    overtimeSummary: null,
    statusData: [],
    hoursData: [],
    auditLogs: [],
    statsLoading: false,
    auditLogsLoading: false,
  }),
}));
// The grid itself is covered elsewhere; surface the props the page decides.
vi.mock("./components/AdminDashboardWidgets", () => ({
  AdminDashboardWidgets: (p: { editing: boolean; sectionFiltered: boolean }) => (
    <p data-testid="widgets">
      editing:{String(p.editing)} filtered:{String(p.sectionFiltered)}
    </p>
  ),
}));

const renderPage = (url = "/admin") =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={new QueryClient()}>
        <AdminDashboardPage />
      </QueryClientProvider>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  ctx.saveStatus = "idle";
  ctx.resetLayout.mockResolvedValue(undefined);
});

describe("Edit layout toggle", () => {
  it("enters edit mode, shows Done, and Esc leaves it", () => {
    renderPage();
    expect(screen.getByTestId("widgets")).toHaveTextContent("editing:false");
    fireEvent.click(screen.getByRole("button", { name: "Edit layout" }));
    expect(screen.getByTestId("widgets")).toHaveTextContent("editing:true");
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("widgets")).toHaveTextContent("editing:false");
  });

  it("is disabled with an explanation when a section is selected", () => {
    renderPage("/admin?section=trends");
    const button = screen.getByRole("button", { name: "Edit layout" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("title", "Switch to All to rearrange widgets");
    fireEvent.click(button);
    expect(screen.getByTestId("widgets")).toHaveTextContent("editing:false filtered:true");
  });

  it("leaves edit mode when the section tab changes", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Edit layout" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Leave" }));
    expect(screen.getByTestId("widgets")).toHaveTextContent("editing:false");
  });

  it("shows the save status from the ordered queue and retries", () => {
    ctx.saveStatus = "error";
    renderPage();
    expect(screen.getByText(/Couldn.t save/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(ctx.retrySave).toHaveBeenCalled();
  });
});

describe("Reset to default", () => {
  it("offers an 8 second Undo that restores the previous layout", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Dashboard actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /reset to default/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Reset layout" }));
    await waitFor(() => expect(ctx.toast).toHaveBeenCalled());
    const [message, options] = ctx.toast.mock.calls[0];
    expect(message).toBe("Dashboard reset to default");
    expect(options.duration).toBe(8000);
    expect(options.action.label).toBe("Undo");
    options.action.onClick();
    expect(ctx.updateLayout).toHaveBeenCalledWith(defaultAdminLayout);
  });
});
