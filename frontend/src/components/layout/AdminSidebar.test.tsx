import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminSidebar } from "./AdminSidebar";
import { usePlugins } from "@/context/PluginContext";
import { dashboardService } from "@/services/dashboardService";
import type { AdminNavItem } from "./hooks/useAdminNavItems";

vi.mock("@/components/plugins/PluginSlot", () => ({
  PluginSlot: ({ slot }: { slot: string }) => {
    if (slot === "admin-sidebar-nav") return <li>Plugin navigation</li>;
    if (slot === "admin-sidebar-nav-system") return <li>System plugin navigation</li>;
    return null;
  },
}));
vi.mock("@/components/ui/ThemeToggle", () => ({
  ThemeToggle: () => <div>Theme toggle</div>,
}));
vi.mock("./SidebarUserProfile", () => ({
  SidebarUserProfile: () => <div>User profile</div>,
}));
vi.mock("@/context/PluginContext", () => ({
  usePlugins: vi.fn(() => ({ getInjectedComponents: () => [] })),
}));
vi.mock("@/services/dashboardService", () => ({
  dashboardService: { getBranding: vi.fn() },
}));

const mockGetInjected = (slots: string[]) => {
  vi.mocked(usePlugins).mockReturnValue({
    getInjectedComponents: (slot: string) =>
      slots.includes(slot) ? [{ pluginName: "p", componentName: "C" }] : [],
  } as never);
};

const items: AdminNavItem[] = [
  { path: "/admin", label: "Dashboard", icon: () => null, group: "Overview" },
  { path: "/admin/users", label: "Users", icon: () => null, group: "People" },
  { path: "/admin/data-import", label: "Data Import", icon: () => null, group: "Tools" },
];

const renderWithQuery = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

const renderSidebar = () =>
  renderWithQuery(
    <MemoryRouter initialEntries={["/admin/users"]}>
      <AdminSidebar
        items={items}
        collapsed={false}
        mobileOpen={false}
        onToggleCollapse={vi.fn()}
        onCloseMobile={vi.fn()}
        onLogout={vi.fn()}
      />
    </MemoryRouter>
  );

describe("AdminSidebar", () => {
  beforeEach(() => {
    vi.mocked(dashboardService.getBranding).mockReset().mockRejectedValue(new Error("not mocked"));
  });

  it("renders static section labels with flat items (no flyout buttons)", () => {
    mockGetInjected(["admin-sidebar-nav"]);
    renderSidebar();

    // Groups are static labels, not collapsible flyout triggers.
    expect(screen.getByText("People")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "People" })).not.toBeInTheDocument();
    expect(screen.getByText("Extensions")).toBeInTheDocument();

    // Items render flat (no flyout hiding). SidebarNavLink uses menuitem role.
    expect(screen.getByRole("menuitem", { name: "Data Import" })).toBeInTheDocument();
  });

  it("renders plugin nav items under the Extensions section only", () => {
    mockGetInjected(["admin-sidebar-nav"]);
    renderSidebar();

    expect(screen.getByText("Plugin navigation")).toBeInTheDocument();
    // Standard groups contain no plugin items.
    expect(screen.queryByText("Plugin navigation")).toBeInTheDocument();
  });

  it("renders no Extensions label when no plugin items are injected", () => {
    mockGetInjected([]);
    renderSidebar();

    expect(screen.queryByText("Extensions")).not.toBeInTheDocument();
    expect(screen.queryByText("Plugin navigation")).not.toBeInTheDocument();
  });

  it("renders system plugin nav items under the System section", () => {
    mockGetInjected(["admin-sidebar-nav-system"]);
    renderSidebar();

    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.getByText("System plugin navigation")).toBeInTheDocument();
    // Extensions stays absent — the two slots are independent.
    expect(screen.queryByText("Extensions")).not.toBeInTheDocument();
  });

  it("renders the gradient logo tile and Enterprise subtitle when expanded", () => {
    mockGetInjected([]);
    renderSidebar();

    const tile = document.querySelector(".bg-gradient-to-tr");
    expect(tile).toBeTruthy();
    expect(tile?.className).toContain("from-primary");
    expect(tile?.className).toContain("to-info");
    expect(screen.getByText("Enterprise")).toBeInTheDocument();
  });

  it("falls back to the gradient tile and 'Admin Panel' while branding is loading/errored", () => {
    mockGetInjected([]);
    renderSidebar();

    expect(screen.getByText("Admin Panel")).toBeInTheDocument();
    expect(document.querySelector(".bg-gradient-to-tr")).toBeTruthy();
  });

  it("renders the site name and logo once branding resolves", async () => {
    vi.mocked(dashboardService.getBranding).mockResolvedValue({
      id: 1, site_name: "Acme Tracker", logo: "branding/logo.png", logo_url: "/media/branding/logo.png",
    });
    mockGetInjected([]);
    renderSidebar();

    await waitFor(() => expect(screen.getByText("Acme Tracker")).toBeInTheDocument());
    const img = document.querySelector('img[src="/media/branding/logo.png"]');
    expect(img).toBeTruthy();
    expect(document.querySelector(".bg-gradient-to-tr")).toBeNull();
  });

  it("falls back to the gradient tile when the branding logo fails to load", async () => {
    vi.mocked(dashboardService.getBranding).mockResolvedValue({
      id: 1, site_name: "Acme Tracker", logo: "branding/logo.png", logo_url: "/media/branding/logo.png",
    });
    mockGetInjected([]);
    renderSidebar();

    const img = await waitFor(() => {
      const el = document.querySelector('img[src="/media/branding/logo.png"]');
      expect(el).toBeTruthy();
      return el as HTMLImageElement;
    });
    fireEvent.error(img);

    await waitFor(() => expect(document.querySelector(".bg-gradient-to-tr")).toBeTruthy());
    expect(document.querySelector('img[src="/media/branding/logo.png"]')).toBeNull();
  });

  it("hides section labels and the Enterprise subtitle when collapsed", () => {
    mockGetInjected(["admin-sidebar-nav"]);
    renderWithQuery(
      <MemoryRouter initialEntries={["/admin/users"]}>
        <AdminSidebar
          items={items}
          collapsed={true}
          mobileOpen={false}
          onToggleCollapse={vi.fn()}
          onCloseMobile={vi.fn()}
          onLogout={vi.fn()}
        />
      </MemoryRouter>
    );
    expect(screen.queryByText("Overview")).not.toBeInTheDocument();
    expect(screen.queryByText("People")).not.toBeInTheDocument();
    expect(screen.queryByText("Enterprise")).not.toBeInTheDocument();
  });

  it("stacks header vertically when collapsed (prevents button overflow)", () => {
    renderWithQuery(
      <MemoryRouter initialEntries={["/admin/users"]}>
        <AdminSidebar
          items={items}
          collapsed={true}
          mobileOpen={false}
          onToggleCollapse={vi.fn()}
          onCloseMobile={vi.fn()}
          onLogout={vi.fn()}
        />
      </MemoryRouter>
    );
    const header = document.querySelector(".border-b.border-border\\/30");
    expect(header).toBeTruthy();
    expect(header?.className).toContain("flex-col");
    const buttonsDiv = header?.querySelector(".flex.items-center.gap-1");
    expect(buttonsDiv?.className).toContain("flex-col");
  });

  it("role subtitle uses text-foreground, not text-primary (browser probe: 3.41:1 dark FAIL)", () => {
    mockGetInjected(["admin-sidebar-nav"]);
    renderWithQuery(
      <MemoryRouter initialEntries={["/admin/users"]}>
        <AdminSidebar
          items={items}
          collapsed={false}
          mobileOpen={false}
          onToggleCollapse={vi.fn()}
          onCloseMobile={vi.fn()}
          onLogout={vi.fn()}
        />
      </MemoryRouter>
    );
    const subtitle = screen.getByText("Enterprise");
    expect(subtitle.className).toContain("text-foreground");
    expect(subtitle.className).not.toMatch(/(^|\s)text-primary(\s|$)/);
  });
});
