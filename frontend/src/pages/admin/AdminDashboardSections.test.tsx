import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminDashboardPage } from "./AdminDashboardPage";

const widgetProbe = vi.fn();
const mutate = { handleToggleWidget: vi.fn() };

vi.mock("@/context/PermissionContext", () => ({
  usePermissions: () => ({
    availableDashboards: ["admin"],
    isAdmin: true,
    isHR: false,
    isTeamLeader: false,
    isSuperuser: false,
  }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 1, username: "admin" } }) }));
vi.mock("./components/AdminInsightsStrip", () => ({ AdminInsightsStrip: () => null }));
vi.mock("./components/AdminDashboardFreshness", () => ({ AdminDashboardFreshness: () => null }));
vi.mock("./components/AdminDashboardWidgets", () => ({
  AdminDashboardWidgets: (props: { isWidgetActive: (id: string) => boolean }) => {
    widgetProbe(props.isWidgetActive);
    return (
      <div>
        <span>{props.isWidgetActive("total-users") ? "users-on" : "users-off"}</span>
        <span>{props.isWidgetActive("pending-backlog") ? "backlog-on" : "backlog-off"}</span>
        <span>{props.isWidgetActive("removed-widget") ? "ghost-on" : "ghost-off"}</span>
      </div>
    );
  },
}));
vi.mock("./hooks/useAdminDashboardPage", () => ({
  useAdminDashboardPage: () => ({
    resetLayout: vi.fn(),
    customizeModalOpen: false,
    setCustomizeModalOpen: vi.fn(),
    isWidgetActive: () => true,
    handleToggleWidget: mutate.handleToggleWidget,
    activeWidgetIds: ["total-users", "pending-backlog", "removed-widget"],
  }),
}));

const Search = () => <div data-testid="search">{useLocation().search}</div>;

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={new QueryClient()}>
        <AdminDashboardPage />
        <Search />
      </QueryClientProvider>
    </MemoryRouter>
  );

beforeEach(() => {
  widgetProbe.mockClear();
  mutate.handleToggleWidget.mockClear();
});

describe("admin dashboard section tabs", () => {
  it("shows every active widget on All", () => {
    renderAt("/admin");
    expect(screen.getByText("users-on")).toBeInTheDocument();
    expect(screen.getByText("backlog-on")).toBeInTheDocument();
  });

  it("filters to the section named in ?section=", () => {
    renderAt("/admin?section=approvals");
    expect(screen.getByText("users-off")).toBeInTheDocument();
    expect(screen.getByText("backlog-on")).toBeInTheDocument();
  });

  it("falls back to All for an unknown section", () => {
    renderAt("/admin?section=nonsense");
    expect(screen.getByText("users-on")).toBeInTheDocument();
  });

  it("writes ?section= when a tab is chosen and keeps other params", () => {
    renderAt("/admin?foo=1");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Approvals" }));
    fireEvent.click(screen.getByRole("tab", { name: "Approvals" }));
    const search = screen.getByTestId("search").textContent ?? "";
    expect(search).toContain("section=approvals");
    expect(search).toContain("foo=1");
  });

  it("never treats unknown widget ids as active inside a section", () => {
    renderAt("/admin?section=approvals");
    expect(screen.getByText("ghost-off")).toBeInTheDocument();
  });

  it("is a pure view filter: a tab change does not toggle any widget", () => {
    renderAt("/admin");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Overview" }));
    fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
    expect(mutate.handleToggleWidget).not.toHaveBeenCalled();
  });
});
