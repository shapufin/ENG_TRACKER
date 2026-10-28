import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecentActivityWidget } from "./RecentActivityWidget";

const logs = [
  {
    id: 1,
    action: "MAINTENANCE_BLOCKED",
    action_display: "Maintenance Blocked",
    description: "Login refused for username 'employee': the platform is under maintenance",
  },
  {
    id: 2,
    action: "LOGIN_SUCCESS",
    action_display: "Login Success",
    description: "User 'staff' signed in successfully",
  },
];

describe("RecentActivityWidget", () => {
  it("shows the human action label, not the raw audit code", () => {
    render(<RecentActivityWidget auditLogs={logs} />);

    expect(screen.getByText("Maintenance Blocked")).toBeInTheDocument();
    expect(screen.queryByText("MAINTENANCE_BLOCKED")).not.toBeInTheDocument();
    expect(screen.getByText("Login Success")).toBeInTheDocument();
  });

  it("falls back to the raw code when the API sends no display label", () => {
    render(
      <RecentActivityWidget
        auditLogs={[{ id: 3, action: "MAINTENANCE_ON", description: "enabled" }]}
      />
    );

    expect(screen.getByText("MAINTENANCE_ON")).toBeInTheDocument();
  });
});
