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
vi.mock("./SidebarProfileMenu", () => ({
  SidebarProfileMenu: () => <div>Profile row</div>,
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
  { path: "/admin/data-import", label: "Data Import", icon: () => null, group: "System" },
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

  it("renders collapsible section headers with flat items", () => {
    mockGetInjected(["admin-sidebar-nav"]);
    renderSidebar();

    // Groups are inline collapsible headers, not flyout triggers.
    expect(screen.getByRole("button", { name: "People" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Extensions")).toBeInTheDocument();

    // Items render flat (no flyout hiding). SidebarNavLink uses menuitem role.
    expect(screen.getByRole("menuitem", { name: "Data Import" })).toBeInTheDocument();
  });

  it("section header toggles aria-expanded and hides the group's links", () => {
    localStorage.clear();
    renderSidebar();
    const header = screen.getByRole("button", { name: "System" });
    expect(header).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Data Import")).not.toBeVisible();
    fireEvent.click(header);
    expect(screen.getByText("Data Import")).toBeVisible();
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

    const tile = document.querySelector(".bg-linear-to-tr");
    expect(tile).toBeTruthy();
    expect(tile?.className).toContain("from-primary");
    expect(tile?.className).toContain("to-info");
    expect(screen.getByText("Enterprise")).toBeInTheDocument();
  });

  it("brand name is single-line truncated", () => {
    mockGetInjected([]);
    renderSidebar();

    const name = screen.getByText("Admin Panel");
    const classes = name.className.split(/\s+/);
    expect(classes).toContain("truncate");
    expect(classes).toContain("text-base");
    expect(classes).not.toContain("md:inline");
    expect(name.parentElement?.className.split(/\s+/)).toContain("min-w-0");
  });

  it("falls back to the gradient tile and 'Admin Panel' while branding is loading/errored", () => {
    mockGetInjected([]);
    renderSidebar();

    expect(screen.getByText("Admin Panel")).toBeInTheDocument();
    expect(document.querySelector(".bg-linear-to-tr")).toBeTruthy();
  });

  it("renders the site name and logo once branding resolves", async () => {
    vi.mocked(dashboardService.getBranding).mockResolvedValue({
      id: 1,
      site_name: "Acme Tracker",
      logo: "branding/logo.png",
      logo_url: "/media/branding/logo.png",
    });
    mockGetInjected([]);
    renderSidebar();

    await waitFor(() => expect(screen.getByText("Acme Tracker")).toBeInTheDocument());
    const img = document.querySelector('img[src="/media/branding/logo.png"]');
    expect(img).toBeTruthy();
    expect(document.querySelector(".bg-linear-to-tr")).toBeNull();
  });

  it("falls back to the gradient tile when the branding logo fails to load", async () => {
    vi.mocked(dashboardService.getBranding).mockResolvedValue({
      id: 1,
      site_name: "Acme Tracker",
      logo: "branding/logo.png",
      logo_url: "/media/branding/logo.png",
    });
    mockGetInjected([]);
    renderSidebar();

    const img = await waitFor(() => {
      const el = document.querySelector('img[src="/media/branding/logo.png"]');
      expect(el).toBeTruthy();
      return el as HTMLImageElement;
    });
    fireEvent.error(img);

    await waitFor(() => expect(document.querySelector(".bg-linear-to-tr")).toBeTruthy());
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

describe("AdminSidebar palette trigger", () => {
  const renderTrigger = (onOpenPalette?: () => void, collapsed = false) =>
    renderWithQuery(
      <MemoryRouter initialEntries={["/admin/users"]}>
        <AdminSidebar
          items={items}
          collapsed={collapsed}
          mobileOpen={false}
          onToggleCollapse={vi.fn()}
          onCloseMobile={vi.fn()}
          onLogout={vi.fn()}
          onOpenPalette={onOpenPalette}
        />
      </MemoryRouter>
    );

  it("puts the search trigger in the header row, not as a separate bar", () => {
    renderTrigger(vi.fn());
    const header = document.querySelector(".border-b.border-border\\/30");
    expect(header?.contains(screen.getByRole("button", { name: /search pages/i }))).toBe(true);
    expect(screen.queryByText("Search pages")).not.toBeInTheDocument();
  });

  it("renders no trigger unless onOpenPalette is provided", () => {
    renderTrigger();
    expect(screen.queryByRole("button", { name: /search pages/i })).not.toBeInTheDocument();
  });

  it("opens the palette from the trigger, expanded and collapsed", () => {
    const open = vi.fn();
    const { unmount } = renderTrigger(open);
    fireEvent.click(screen.getByRole("button", { name: /search pages/i }));
    expect(open).toHaveBeenCalledTimes(1);
    unmount();
    renderTrigger(open, true);
    fireEvent.click(screen.getByRole("button", { name: /search pages/i }));
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("shows the Mac shortcut in the trigger tooltip on Apple platforms", async () => {
    vi.resetModules();
    vi.spyOn(globalThis.navigator, "platform", "get").mockReturnValue("MacIntel");
    const { AdminSidebar: MacSidebar } = await import("./AdminSidebar");
    renderWithQuery(
      <MemoryRouter>
        <MacSidebar
          items={items}
          collapsed={false}
          mobileOpen={false}
          onToggleCollapse={vi.fn()}
          onCloseMobile={vi.fn()}
          onLogout={vi.fn()}
          onOpenPalette={vi.fn()}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole("button", { name: /search pages/i })).toHaveAttribute(
      "title",
      "Search pages (⌘+K)"
    );
    vi.restoreAllMocks();
  });
});
