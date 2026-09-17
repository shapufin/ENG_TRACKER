import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Sidebar } from "./Sidebar";
import { dashboardService } from "@/services/dashboardService";
import type { NavItem } from "./hooks/useVisibleNavItems";

vi.mock("./SidebarNav", () => ({ SidebarNav: () => <nav data-testid="sidebar-nav" /> }));
vi.mock("./SidebarUserProfile", () => ({
  SidebarUserProfile: () => <div data-testid="user-profile" />,
}));
vi.mock("@/components/ui/ThemeToggle", () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));
vi.mock("@/components/plugins/PluginSlot", () => ({
  PluginSlot: () => <div data-testid="plugin-slot" />,
}));
vi.mock("@/services/dashboardService", () => ({
  dashboardService: { getBranding: vi.fn() },
}));

const items: NavItem[] = [{ path: "/", label: "Home", icon: () => null, section: "core" }];
const user = { first_name: "Alice", last_name: "A", email: "a@b.com" };

const renderWithQuery = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

describe("Sidebar", () => {
  beforeEach(() => {
    vi.mocked(dashboardService.getBranding).mockReset().mockRejectedValue(new Error("not mocked"));
  });

  it("renders expanded sidebar", () => {
    renderWithQuery(
      <Sidebar
        items={items}
        collapsed={false}
        mobileOpen={false}
        onToggleCollapse={vi.fn()}
        onCloseMobile={vi.fn()}
        user={user}
        onLogout={vi.fn()}
      />
    );
    expect(screen.getByText("Time Tracker")).toBeInTheDocument();
    expect(screen.getByText("Logout")).toBeInTheDocument();
  });

  it("renders collapsed sidebar", () => {
    renderWithQuery(
      <Sidebar
        items={items}
        collapsed={true}
        mobileOpen={false}
        onToggleCollapse={vi.fn()}
        onCloseMobile={vi.fn()}
        user={user}
        onLogout={vi.fn()}
      />
    );
    expect(screen.queryByText("Time Tracker")).not.toBeInTheDocument();
    expect(screen.queryByText("Logout")).not.toBeInTheDocument();
  });

  it("stacks header vertically when collapsed (prevents button overflow)", () => {
    renderWithQuery(
      <Sidebar
        items={items}
        collapsed={true}
        mobileOpen={false}
        onToggleCollapse={vi.fn()}
        onCloseMobile={vi.fn()}
        user={user}
        onLogout={vi.fn()}
      />
    );
    // The header border-b div is the first child of the aside.
    const header = document.querySelector(".border-b.border-border\\/30");
    expect(header).toBeTruthy();
    expect(header?.className).toContain("flex-col");
    // The buttons container (flex items-center gap-1) must also be flex-col
    // so the bell + expand button stack vertically and fit within 44px.
    const buttonsDiv = header?.querySelector(".flex.items-center.gap-1");
    expect(buttonsDiv?.className).toContain("flex-col");
  });

  it("calls handlers", () => {
    const onToggleCollapse = vi.fn();
    const onCloseMobile = vi.fn();
    const onLogout = vi.fn();
    renderWithQuery(
      <Sidebar
        items={items}
        collapsed={false}
        mobileOpen={false}
        onToggleCollapse={onToggleCollapse}
        onCloseMobile={onCloseMobile}
        user={user}
        onLogout={onLogout}
      />
    );
    fireEvent.click(
      document.querySelector("button[title]") || document.querySelectorAll("button")[1]
    );
    expect(onToggleCollapse).toHaveBeenCalled();
  });

  it("renders the gradient logo tile (mockup fidelity)", () => {
    renderWithQuery(
      <Sidebar
        items={items}
        collapsed={false}
        mobileOpen={false}
        onToggleCollapse={vi.fn()}
        onCloseMobile={vi.fn()}
        user={user}
        onLogout={vi.fn()}
      />
    );
    const tile = document.querySelector(".bg-gradient-to-tr");
    expect(tile).toBeTruthy();
    expect(tile?.className).toContain("from-primary");
    expect(tile?.className).toContain("to-info");
  });

  it("renders the site name and logo once branding resolves, replacing the static fallback", async () => {
    vi.mocked(dashboardService.getBranding).mockResolvedValue({
      id: 1, site_name: "Acme Tracker", logo: "branding/logo.png", logo_url: "/media/branding/logo.png",
    });
    renderWithQuery(
      <Sidebar
        items={items}
        collapsed={false}
        mobileOpen={false}
        onToggleCollapse={vi.fn()}
        onCloseMobile={vi.fn()}
        user={user}
        onLogout={vi.fn()}
      />
    );

    await waitFor(() => expect(screen.getByText("Acme Tracker")).toBeInTheDocument());
    expect(screen.queryByText("Time Tracker")).not.toBeInTheDocument();
    expect(document.querySelector('img[src="/media/branding/logo.png"]')).toBeTruthy();
    await waitFor(() => expect(document.title).toBe("Acme Tracker"));
  });

  it("renders the role subtitle when expanded and hides it when collapsed", () => {
    renderWithQuery(
      <Sidebar
        items={items}
        collapsed={false}
        mobileOpen={false}
        onToggleCollapse={vi.fn()}
        onCloseMobile={vi.fn()}
        user={user}
        onLogout={vi.fn()}
        roleSubtitle="Team Leader"
      />
    );
    expect(screen.getByText("Team Leader")).toBeInTheDocument();
  });

  it("hides the role subtitle when collapsed", () => {
    renderWithQuery(
      <Sidebar
        items={items}
        collapsed={true}
        mobileOpen={false}
        onToggleCollapse={vi.fn()}
        onCloseMobile={vi.fn()}
        user={user}
        onLogout={vi.fn()}
        roleSubtitle="Team Leader"
      />
    );
    expect(screen.queryByText("Team Leader")).not.toBeInTheDocument();
  });

  it("role subtitle uses text-foreground, not text-primary (browser probe: 3.41:1 dark FAIL)", () => {
    renderWithQuery(
      <Sidebar
        items={items}
        collapsed={false}
        mobileOpen={false}
        onToggleCollapse={vi.fn()}
        onCloseMobile={vi.fn()}
        user={user}
        onLogout={vi.fn()}
        roleSubtitle="Team Leader"
      />
    );
    const subtitle = screen.getByText("Team Leader");
    expect(subtitle.className).toContain("text-foreground");
    expect(subtitle.className).not.toMatch(/(^|\s)text-primary(\s|$)/);
  });
});
