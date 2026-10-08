import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AdminQuickLinks } from "./AdminQuickLinks";

const ROUTES: Record<string, string> = {
  Users: "/admin/users",
  Teams: "/admin/teams",
  Clients: "/admin/clients",
  "Resource Access": "/admin/resource-access",
  "Calendar Mgmt": "/admin/calendars",
  Reports: "/admin/reports",
  "Leave Balances": "/admin/leave-balances",
};

const renderLinks = () =>
  render(
    <MemoryRouter>
      <AdminQuickLinks />
    </MemoryRouter>
  );

describe("AdminQuickLinks (shortcuts widget)", () => {
  it("is one compact row of real links, marked for PDF export", () => {
    const { container } = renderLinks();
    expect(container.querySelector("[data-chart-section='shortcuts']")).not.toBeNull();
    const nav = screen.getByRole("navigation", { name: "Admin shortcuts" });
    expect(nav.querySelectorAll("a")).toHaveLength(7);
    for (const [name, href] of Object.entries(ROUTES)) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });

  it("does not lift on hover", () => {
    const { container } = renderLinks();
    expect(container.innerHTML).not.toMatch(/hover:-translate-y/);
  });
});
