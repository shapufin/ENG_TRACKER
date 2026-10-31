import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HRRecentTable } from "./HRRecentTable";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const rows = [
  {
    id: 1,
    user: "Ana Alpha",
    userInitials: "AA",
    duration: "2h",
    date: "Oct 1, 2026",
    status: "approved",
  },
];

describe("HRRecentTable", () => {
  it("shows when each recent row happened", () => {
    render(<HRRecentTable title="Recent Overtime" data={rows} />);
    expect(screen.getByText("Ana Alpha")).toBeInTheDocument();
    expect(screen.getByText("2h")).toBeInTheDocument();
    expect(screen.getByText("Oct 1, 2026")).toBeInTheDocument();
  });

  it("has no control that does nothing", () => {
    render(<HRRecentTable title="Recent Overtime" data={rows} />);
    expect(screen.queryByRole("button", { name: /more options/i })).not.toBeInTheDocument();
  });
});
