import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HRQuickLinks } from "./HRQuickLinks";

describe("HRQuickLinks", () => {
  it("links to existing management routes", () => {
    render(
      <MemoryRouter>
        <HRQuickLinks />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: /Export Payroll/ })).toHaveAttribute(
      "href",
      "/hr/payroll/runs"
    );
    expect(screen.getByRole("link", { name: /Company Holidays/ })).toHaveAttribute(
      "href",
      "/hr/calendars"
    );
    expect(screen.getByRole("link", { name: /Department Settings/ })).toHaveAttribute(
      "href",
      "/hr/teams"
    );
    expect(screen.getByRole("link", { name: /Team Leader Assignment/ })).toHaveAttribute(
      "href",
      "/hr/team-leaders"
    );
  });

  it("does not offer Add Employee — HR has no create-user permission", () => {
    render(
      <MemoryRouter>
        <HRQuickLinks />
      </MemoryRouter>
    );

    expect(screen.queryByRole("link", { name: /Add Employee/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Add Employee/)).not.toBeInTheDocument();
  });
});
