import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PersonalDashboardPendingCard } from "./PersonalDashboardPendingCard";

const renderCard = (props = {}) =>
  render(
    <MemoryRouter>
      <PersonalDashboardPendingCard personalPendingItems={[]} {...props} />
    </MemoryRouter>
  );

describe("PersonalDashboardPendingCard", () => {
  it("renders an icon-centered empty state when there are no pending items", () => {
    const { container } = renderCard();

    expect(screen.getByText("You're all caught up!")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("links each row to its details page", () => {
    renderCard({
      personalPendingItems: [
        {
          id: "ot-1",
          label: "Overtime Request",
          amount: "4h",
          date: "2024-06-01",
          status: "pending",
          detailsPath: "/overtime",
        },
        {
          id: "leave-2",
          label: "Leave Request",
          amount: "2d",
          date: "2024-06-02",
          status: "pending",
          detailsPath: "/leave-management",
        },
      ],
    });

    const links = screen.getAllByRole("link", { name: /View Details/ });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/overtime");
    expect(links[1]).toHaveAttribute("href", "/leave-management");
  });
});
