import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { TeamMemberDetailPanel } from "./TeamMemberDetailPanel";
import { formatWage } from "./teamMeta";
import type { TeamMemberSummary } from "../../types/tlScorecard";

const mockMember: TeamMemberSummary = {
  id: 101,
  full_name: "John Doe",
  username: "johndoe",
  email: "john.doe@example.com",
  seniority_level: "senior",
  wage: {
    gross_monthly: "120000",
    status: "ok",
    effective_from: "2024-01-01",
  },
  leave: {
    total_days: "25.0",
    used_days: "10.0",
    pending_days: "2.0",
    available_days: "13.0",
    upcoming: [
      {
        start_date: "2026-11-01",
        end_date: "2026-11-05",
        request_type: "annual",
        business_days: 5,
      },
    ],
  },
  epr: {
    year: 2026,
    next_stage: "mid_year",
    goal_setting_done: true,
    mid_year_done: false,
    final_review_done: false,
    goal_count: 4,
  },
  governance: {
    open_pip: true,
    pip_status: "active",
    open_idle_flags: 2,
    open_absences: 1,
    pending_promotion: true,
  },
  meetings: {
    last_one_on_one_on: "2026-09-15",
  },
};

describe("TeamMemberDetailPanel", () => {
  it("renders nothing without a member", () => {
    const { container } = render(
      <BrowserRouter>
        <TeamMemberDetailPanel member={null} onOpenChange={vi.fn()} />
      </BrowserRouter>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows member profile hero and details", () => {
    render(
      <BrowserRouter>
        <TeamMemberDetailPanel member={mockMember} onOpenChange={vi.fn()} />
      </BrowserRouter>
    );

    // Profile hero
    expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    expect(screen.getByText("john.doe@example.com")).toBeInTheDocument();
    expect(screen.getByText("Senior")).toBeInTheDocument();

    // Section headings
    expect(screen.getByRole("heading", { name: "Compensation" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Time off/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /EPR/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Governance" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Meetings" })).toBeInTheDocument();
  });

  it("renders compensation and leave stats properly", () => {
    render(
      <BrowserRouter>
        <TeamMemberDetailPanel member={mockMember} onOpenChange={vi.fn()} />
      </BrowserRouter>
    );

    expect(screen.getByText(/120.*000/)).toBeInTheDocument();
    expect(screen.getByText("01/01/2024")).toBeInTheDocument();

    // Leave metrics
    expect(screen.getByText("13 d")).toBeInTheDocument();
    expect(screen.getByText("10 d")).toBeInTheDocument();
    expect(screen.getByText("25 d")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Leave used" })).toBeInTheDocument();

    // Upcoming leave
    expect(screen.getByText(/01\/11\/2026 – 05\/11\/2026/)).toBeInTheDocument();
    expect(screen.getByText("5 business days")).toBeInTheDocument();
  });

  it("renders governance chips and open records link", () => {
    render(
      <BrowserRouter>
        <TeamMemberDetailPanel member={mockMember} onOpenChange={vi.fn()} />
      </BrowserRouter>
    );

    expect(screen.getByText(/Open · active/)).toBeInTheDocument();
    expect(screen.getByText("2 open flags")).toBeInTheDocument();
    expect(screen.getByText("1 unaddressed")).toBeInTheDocument();
    expect(screen.getByText("Nominated")).toBeInTheDocument();

    // Navigation button
    const link = screen.getByRole("link", { name: /Open records/ });
    expect(link).toHaveAttribute("href", "/tl-scorecard?tab=records");
  });
});
