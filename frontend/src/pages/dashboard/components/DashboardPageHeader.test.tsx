import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { DashboardPageHeader } from "./DashboardPageHeader";

describe("DashboardPageHeader", () => {
  it("names the settings shortcut for assistive technology", () => {
    render(
      <MemoryRouter>
        <DashboardPageHeader
          availableDashboards={["employee"]}
          currentDashboard="employee"
          onDashboardChange={() => undefined}
          isTeamLeader={false}
          isHR={false}
          isAdmin={false}
          isSuperuser={false}
          showSettings
        />
      </MemoryRouter>
    );

    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
  });
});
