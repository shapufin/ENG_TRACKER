import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Clock, LayoutDashboard } from "lucide-react";
import { MobileBottomNav } from "./MobileBottomNav";
import type { NavItem } from "./hooks/useVisibleNavItems";

const item = (path: string, label: string): NavItem => ({
  path,
  label,
  icon: path === "/dashboard" ? LayoutDashboard : Clock,
  section: "core",
});

const employee = [
  item("/dashboard", "Dashboard"),
  item("/overtime", "Overtime"),
  item("/standby", "Standby"),
  item("/leave-management", "Leave"),
  item("/calendar", "Calendar"),
  item("/settings", "Settings"),
];

const renderNav = (
  items: NavItem[],
  extra: Partial<React.ComponentProps<typeof MobileBottomNav>> = {},
  route = "/overtime"
) =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <MobileBottomNav items={items} onOpenMore={vi.fn()} {...extra} />
    </MemoryRouter>
  );

describe("MobileBottomNav", () => {
  it("pins four daily pages plus More, only below md, and marks the current page", () => {
    const { container } = renderNav(employee);

    expect(container.firstElementChild).toHaveClass("md:hidden");
    const nav = screen.getByRole("navigation", { name: "Primary" });
    const links = nav.querySelectorAll("a");
    expect([...links].map((a) => a.getAttribute("href"))).toEqual([
      "/dashboard",
      "/overtime",
      "/standby",
      "/leave-management",
    ]);
    expect(screen.getByRole("link", { name: "Overtime" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Standby" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();
  });

  it("puts Pending Approvals ahead of Standby for a leader and shows its badge", () => {
    const leader = [
      employee[0],
      item("/team/approvals", "Pending Approvals"),
      employee[1],
      employee[2],
      employee[3],
    ];
    renderNav(leader, { badgeMap: { "/team/approvals": 7 } });

    const hrefs = [
      ...screen.getByRole("navigation", { name: "Primary" }).querySelectorAll("a"),
    ].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/dashboard", "/team/approvals", "/overtime", "/standby"]);
    expect(screen.getByRole("link", { name: /Pending Approvals/ })).toHaveTextContent("7");
  });

  it("opens the full menu from More", () => {
    const onOpenMore = vi.fn();
    renderNav(employee, { onOpenMore });

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(onOpenMore).toHaveBeenCalledOnce();
  });

  it("publishes its height for fixed notices while mounted and clears it after", () => {
    const { unmount } = renderNav(employee);
    expect(document.documentElement.style.getPropertyValue("--bottom-nav-h")).toContain("3.5rem");

    unmount();
    expect(document.documentElement.style.getPropertyValue("--bottom-nav-h")).toBe("");
  });

  it("renders nothing when fewer than three pinned pages are available", () => {
    const { container } = renderNav([
      item("/dashboard", "Dashboard"),
      item("/settings", "Settings"),
    ]);

    expect(container).toBeEmptyDOMElement();
  });

  it("never links a page the sidebar hides", () => {
    renderNav([
      item("/dashboard", "Dashboard"),
      item("/overtime", "Overtime"),
      item("/leave-management", "Leave"),
    ]);

    expect(screen.queryByRole("link", { name: "Standby" })).not.toBeInTheDocument();
  });
});
