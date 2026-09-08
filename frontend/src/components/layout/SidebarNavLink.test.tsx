import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LayoutDashboard } from "lucide-react";
import { SidebarNavLink } from "./SidebarNavLink";

const base = {
  to: "/team/approvals",
  label: "Pending Approvals",
  icon: LayoutDashboard,
  isActive: false,
  collapsed: false,
  onItemClick: () => {},
};

describe("SidebarNavLink badge", () => {
  it("renders an amber pending-count badge with an accessible label", () => {
    render(
      <MemoryRouter>
        <SidebarNavLink {...base} badge={3} />
      </MemoryRouter>
    );
    const badge = screen.getByLabelText("3 pending approvals");
    expect(badge).toHaveTextContent("3");
    expect(badge.className).toContain("bg-amber-500/15");
  });

  it("renders no badge when the count is 0 or absent", () => {
    const { rerender } = render(
      <MemoryRouter>
        <SidebarNavLink {...base} badge={0} />
      </MemoryRouter>
    );
    expect(screen.queryByLabelText(/pending approvals/)).not.toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <SidebarNavLink {...base} />
      </MemoryRouter>
    );
    expect(screen.queryByLabelText(/pending approvals/)).not.toBeInTheDocument();
  });

  it("hides the badge when the sidebar is collapsed", () => {
    render(
      <MemoryRouter>
        <SidebarNavLink {...base} badge={3} collapsed />
      </MemoryRouter>
    );
    expect(screen.queryByLabelText(/pending approvals/)).not.toBeInTheDocument();
  });
});
