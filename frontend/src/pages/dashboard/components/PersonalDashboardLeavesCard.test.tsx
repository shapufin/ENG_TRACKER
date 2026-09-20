import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PersonalDashboardLeavesCard } from "./PersonalDashboardLeavesCard";
import type { LeaveRequest } from "@/types";

const leaves = [
  {
    id: 1,
    start_date: "2024-08-24",
    end_date: "2024-08-26",
    days_requested: 3,
    status: "approved",
  },
] as LeaveRequest[];

const renderCard = (props = {}) =>
  render(
    <MemoryRouter>
      <PersonalDashboardLeavesCard upcomingLeaves={leaves} {...props} />
    </MemoryRouter>
  );

describe("PersonalDashboardLeavesCard", () => {
  it("links to the calendar and the leave request page", () => {
    renderCard();
    expect(screen.getByRole("link", { name: "View Calendar" })).toHaveAttribute(
      "href",
      "/calendar"
    );
    expect(screen.getByRole("link", { name: /Request Time Off/ })).toHaveAttribute(
      "href",
      "/leave-management"
    );
  });

  it("renders leave rows with day counts", () => {
    renderCard();
    expect(screen.getByText("3d")).toBeInTheDocument();
  });
});
