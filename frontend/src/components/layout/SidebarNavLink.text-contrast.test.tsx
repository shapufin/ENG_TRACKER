import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LayoutDashboard } from "lucide-react";
import { SidebarNavLink } from "./SidebarNavLink";

// Phase 5 change A: browser probe confirmed dark active-nav text at 3.2:1
// (FAIL). Active link text must be text-foreground; the icon keeps
// text-primary (graphical element, 3:1 bar).
const base = {
  to: "/team/approvals",
  label: "Pending Approvals",
  icon: LayoutDashboard,
  onItemClick: () => {},
};

describe("SidebarNavLink text contrast", () => {
  it("active nav link uses text-foreground, not text-primary, for text color", () => {
    render(
      <MemoryRouter>
        <SidebarNavLink {...base} isActive collapsed={false} />
      </MemoryRouter>
    );
    const link = screen.getByRole("menuitem", { name: "Pending Approvals" });
    expect(link.className).toContain("text-foreground");
    expect(link.className).not.toMatch(/(^|\s)text-primary(\s|$)/);
  });

  it("active nav icon keeps text-primary", () => {
    render(
      <MemoryRouter>
        <SidebarNavLink {...base} isActive collapsed={false} />
      </MemoryRouter>
    );
    const link = screen.getByRole("menuitem", { name: "Pending Approvals" });
    expect(link.querySelector("svg")?.getAttribute("class")).toContain("text-primary");
  });

  it("inactive nav link uses text-muted-foreground", () => {
    render(
      <MemoryRouter>
        <SidebarNavLink {...base} isActive={false} collapsed={false} />
      </MemoryRouter>
    );
    expect(screen.getByRole("menuitem", { name: "Pending Approvals" }).className).toContain(
      "text-muted-foreground"
    );
  });
});
