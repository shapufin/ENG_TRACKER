import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { User } from "@/types";
import { PhoneDashboardHero } from "./PhoneDashboardHero";

const user = { first_name: "Alex", username: "alex" } as User;

describe("PhoneDashboardHero", () => {
  it("greets the user and restates the period hours", () => {
    render(
      <PhoneDashboardHero
        user={user}
        personalOvertimeHours={3}
        personalStandbyHours={5}
        pendingCount={0}
      />
    );
    expect(screen.getByText("Hello, Alex!")).toBeInTheDocument();
    expect(screen.getByText(/3h overtime · 5h standby/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows a strip that jumps to the pending list when something is pending", () => {
    render(
      <PhoneDashboardHero
        user={user}
        personalOvertimeHours={0}
        personalStandbyHours={0}
        pendingCount={2}
      />
    );
    const strip = screen.getByRole("link", { name: /2 pending approvals/ });
    expect(strip).toHaveAttribute("href", "#my-pending");
  });

  it("is phone-only", () => {
    render(
      <PhoneDashboardHero
        user={user}
        personalOvertimeHours={0}
        personalStandbyHours={0}
        pendingCount={1}
      />
    );
    expect(screen.getByTestId("phone-dashboard-hero")).toHaveClass("md:hidden");
  });
});
