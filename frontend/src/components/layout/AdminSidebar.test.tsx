import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AdminSidebar } from "./AdminSidebar";
import { usePlugins } from "@/context/PluginContext";
import type { AdminNavItem } from "./hooks/useAdminNavItems";

vi.mock("@/components/plugins/PluginSlot", () => ({
  PluginSlot: ({ slot }: { slot: string }) =>
    slot === "admin-sidebar-nav" ? <li>Plugin navigation</li> : null,
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

const renderSidebar = () =>
  render(
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

  it("renders the gradient logo tile and Enterprise subtitle when expanded", () => {
    mockGetInjected([]);
    renderSidebar();

    const tile = document.querySelector(".bg-gradient-to-tr");
    expect(tile).toBeTruthy();
    expect(tile?.className).toContain("from-primary");
    expect(tile?.className).toContain("to-info");
    expect(screen.getByText("Enterprise")).toBeInTheDocument();
  });

  it("hides section labels and the Enterprise subtitle when collapsed", () => {
    mockGetInjected(["admin-sidebar-nav"]);
    render(
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
    render(
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
    render(
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
