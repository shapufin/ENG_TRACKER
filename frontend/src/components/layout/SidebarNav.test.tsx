import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SidebarNav } from "./SidebarNav";
import { usePlugins } from "@/context/PluginContext";
import type { NavItem } from "./hooks/useVisibleNavItems";

const onItemClick = vi.fn();

vi.mock("react-router-dom", async () => {
  const { forwardRef } = await import("react");
  const Link = forwardRef<HTMLAnchorElement, any>(({ children, to, onClick, ...rest }, ref) => (
    <a ref={ref} href={to} onClick={onClick} {...rest}>
      {children}
    </a>
  ));
  Link.displayName = "Link";
  return { Link, useLocation: () => ({ pathname: "/dashboard" }) };
});

vi.mock("framer-motion", () => ({
  motion: { div: ({ children }: any) => <div>{children}</div> },
  useReducedMotion: () => false,
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

const items: NavItem[] = [
  { path: "/dashboard", label: "Dashboard", icon: () => <span>icon</span>, section: "core" },
  { path: "/team", label: "Team", icon: () => <span>icon</span>, section: "leadership" },
];

const allSectionItems: NavItem[] = [
  { path: "/dashboard", label: "Dashboard", icon: () => <span>icon</span>, section: "core" },
  { path: "/overtime", label: "Overtime", icon: () => <span>icon</span>, section: "core" },
  {
    path: "/team/approvals",
    label: "Pending Approvals",
    icon: () => <span>icon</span>,
    section: "leadership",
  },
  {
    path: "/ticket-kpi/dashboard",
    label: "Ticket KPI",
    icon: () => <span>icon</span>,
    section: "skills-kpi",
  },
  { path: "/settings", label: "Settings", icon: () => <span>icon</span>, section: "system" },
];

describe("SidebarNav", () => {
  it("renders expanded nav items", () => {
    render(<SidebarNav items={items} collapsed={false} onItemClick={onItemClick} />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Team")).toBeInTheDocument();
  });

  it("renders collapsed nav items without inline labels", () => {
    render(<SidebarNav items={items} collapsed={true} onItemClick={onItemClick} />);
    expect(document.querySelectorAll("span.md\\:inline").length).toBe(0);
    // Collapsed links are centered and the label is not shown inline.
    const links = screen.getAllByRole("menuitem");
    expect(links.length).toBe(items.length);
    links.forEach((link) => expect(link.className).toContain("md:justify-center"));
  });

  it("shows the label tooltip on hover when collapsed", () => {
    render(<SidebarNav items={items} collapsed={true} onItemClick={onItemClick} />);
    const link = screen.getAllByRole("menuitem")[0];
    // Radix Tooltip opens on pointer/focus interaction; the portal content
    // is not in the DOM until opened.
    expect(screen.queryByRole("tooltip", { name: "Dashboard" })).not.toBeInTheDocument();
    fireEvent.mouseEnter(link);
    fireEvent.focus(link);
    expect(screen.getByRole("tooltip", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("calls onItemClick when link clicked", () => {
    render(<SidebarNav items={items} collapsed={false} onItemClick={onItemClick} />);
    fireEvent.click(screen.getByText("Dashboard"));
    expect(onItemClick).toHaveBeenCalled();
  });

  it("renders section labels in mockup order when expanded", () => {
    mockGetInjected([]);
    render(<SidebarNav items={allSectionItems} collapsed={false} onItemClick={onItemClick} />);
    const labels = screen
      .getAllByText(/^(Core Ops|Leadership|Skills & KPI|System)$/)
      .map((el) => el.textContent);
    expect(labels).toEqual(["Core Ops", "Leadership", "Skills & KPI", "System"]);
  });

  it("omits section labels for sections with no visible items", () => {
    mockGetInjected([]);
    const coreOnly: NavItem[] = [
      { path: "/dashboard", label: "Dashboard", icon: () => <span>icon</span>, section: "core" },
    ];
    render(<SidebarNav items={coreOnly} collapsed={false} onItemClick={onItemClick} />);
    expect(screen.getByText("Core Ops")).toBeInTheDocument();
    expect(screen.queryByText("Leadership")).not.toBeInTheDocument();
    expect(screen.queryByText("Skills & KPI")).not.toBeInTheDocument();
    expect(screen.queryByText("System")).not.toBeInTheDocument();
  });

  it("renders no section labels when collapsed", () => {
    mockGetInjected([]);
    render(<SidebarNav items={allSectionItems} collapsed={true} onItemClick={onItemClick} />);
    expect(screen.queryByText("Core Ops")).not.toBeInTheDocument();
    expect(screen.queryByText("Leadership")).not.toBeInTheDocument();
    expect(screen.queryByText("Skills & KPI")).not.toBeInTheDocument();
    expect(screen.queryByText("System")).not.toBeInTheDocument();
  });

  it("renders the Plugins label only when plugin nav items are injected", () => {
    mockGetInjected(["sidebar-nav"]);
    render(<SidebarNav items={items} collapsed={false} onItemClick={onItemClick} />);
    expect(screen.getByText("Plugins")).toBeInTheDocument();
  });

  it("renders no Plugins label when no plugin nav items are injected", () => {
    mockGetInjected([]);
    render(<SidebarNav items={items} collapsed={false} onItemClick={onItemClick} />);
    expect(screen.queryByText("Plugins")).not.toBeInTheDocument();
  });
});
