import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TeamTab } from "./TeamTab";
import { tlScorecardService } from "../../services/tlScorecardService";
import type { OneOnOnePlan, TeamMemberSummary } from "../../types/tlScorecard";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../../services/tlScorecardService", () => ({
  tlScorecardService: {
    getTeamMembers: vi.fn(),
    setOneOnOnePlans: vi.fn(),
    clearOneOnOnePlans: vi.fn(),
    skipOneOnOne: vi.fn(),
    createMeeting: vi.fn(),
  },
}));
vi.mock("@/services/userService", () => ({
  userService: { getMyTeamMembers: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { teams: [] } }) }));

const PLAN: OneOnOnePlan = {
  cadence: "weekly",
  cadence_day_of_week: 2,
  cadence_nth_week: null,
  cadence_display: "Weekly (Wednesday)",
  next_due_on: "2026-11-18",
  status: "overdue",
  moved_from: "2026-11-11",
  moved_reason: "holiday",
};

const member = (id: number, name: string, plan: OneOnOnePlan | null): TeamMemberSummary => ({
  id,
  full_name: name,
  username: name.toLowerCase().replace(" ", "."),
  email: `${id}@example.com`,
  seniority_level: null,
  wage: { gross_monthly: null, effective_from: null, status: "missing" },
  leave: {
    total_days: "20.0",
    used_days: "0.0",
    pending_days: "0.0",
    available_days: "20.0",
    upcoming: [],
  },
  epr: {
    year: 2026,
    goal_count: 0,
    goal_setting_done: false,
    mid_year_done: false,
    final_review_done: false,
    next_stage: "goal_setting",
  },
  governance: {
    open_pip: false,
    pip_status: null,
    open_idle_flags: 0,
    open_absences: 0,
    pending_promotion: false,
  },
  meetings: { last_one_on_one_on: null, plan },
});

const renderTab = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TeamTab />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe("TeamTab 1-on-1 schedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      }
    );
    (tlScorecardService.getTeamMembers as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [member(1, "Ana Planned", PLAN), member(2, "Bora Unplanned", null)],
    });
    (tlScorecardService.setOneOnOnePlans as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (tlScorecardService.createMeeting as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (tlScorecardService.skipOneOnOne as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (tlScorecardService.clearOneOnOnePlans as ReturnType<typeof vi.fn>).mockResolvedValue({});
  });

  it("shows the next date with its status, and Not set when there is no schedule", async () => {
    renderTab();
    expect(await screen.findByText("18/11/2026")).toBeInTheDocument();
    expect(screen.getAllByText("Overdue").length).toBeGreaterThan(0);
    expect(screen.getByText("Not set")).toBeInTheDocument();
  });

  it("saves a schedule for the people ticked in the dialog", async () => {
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: /set recurring 1-on-1/i }));
    // Dialog opens with everyone ticked; pick a cadence and save.
    fireEvent.click(await screen.findByRole("combobox", { name: /meeting cadence/i }));
    fireEvent.click(await screen.findByRole("option", { name: /^weekly$/i }));
    fireEvent.click(screen.getByRole("button", { name: /save recurring 1-on-1/i }));
    await waitFor(() => expect(tlScorecardService.setOneOnOnePlans).toHaveBeenCalled());
    const body = (tlScorecardService.setOneOnOnePlans as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.employee_ids).toEqual([1, 2]);
    expect(body.cadence).toBe("weekly");
  });

  it("logs a meeting straight from the row, without opening the detail panel", async () => {
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Log meeting with Bora Unplanned" }));
    // A person with no schedule can be logged too; the dialog is a 1-on-1 with them, dated today.
    expect(await screen.findByRole("dialog", { name: /log a meeting/i })).toBeInTheDocument();
    expect(screen.queryByText("Schedule")).not.toBeInTheDocument(); // detail panel stayed closed
    fireEvent.click(screen.getByRole("button", { name: /^log meeting$/i }));
    await waitFor(() => expect(tlScorecardService.createMeeting).toHaveBeenCalled());
    const body = (tlScorecardService.createMeeting as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.counterparty).toBe(2);
    expect(body.meeting_type).toBe("one_on_one");
  });

  it("a planned person's row log is dated on the due slot", async () => {
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Log meeting with Ana Planned" }));
    fireEvent.click(await screen.findByRole("button", { name: /^log meeting$/i }));
    await waitFor(() => expect(tlScorecardService.createMeeting).toHaveBeenCalled());
    const body = (tlScorecardService.createMeeting as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.counterparty).toBe(1);
    expect(body.occurred_on).toBe("2026-11-18");
  });

  it("will not skip without a reason, then sends it", async () => {
    renderTab();
    fireEvent.click(await screen.findByText("Ana Planned"));
    expect(
      await screen.findByText(/moved from 11\/11\/2026 \(public holiday\)/i)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    const submit = await screen.findByRole("button", { name: /skip 1-on-1/i });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "On a client site" } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() =>
      expect(tlScorecardService.skipOneOnOne).toHaveBeenCalledWith({
        employee: 1,
        reason: "On a client site",
      })
    );
  });

  it("skips every overdue slot at once when the box is ticked", async () => {
    renderTab();
    fireEvent.click(await screen.findByText("Ana Planned"));
    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
    fireEvent.change(await screen.findByLabelText(/reason/i), { target: { value: "Crunch" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /skip all overdue/i }));
    fireEvent.click(screen.getByRole("button", { name: /skip 1-on-1/i }));
    await waitFor(() =>
      expect(tlScorecardService.skipOneOnOne).toHaveBeenCalledWith({
        employee: 1,
        reason: "Crunch",
        all_due: true,
      })
    );
  });

  it("offers the skip-all box only for an overdue slot", async () => {
    (tlScorecardService.getTeamMembers as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        member(1, "Ana Planned", { ...PLAN, status: "due", moved_from: null, moved_reason: null }),
      ],
    });
    renderTab();
    fireEvent.click(await screen.findByText("Ana Planned"));
    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
    await screen.findByLabelText(/reason/i);
    expect(screen.queryByRole("checkbox", { name: /skip all overdue/i })).not.toBeInTheDocument();
  });

  it("offers no Skip for a slot that is not due yet", async () => {
    (tlScorecardService.getTeamMembers as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        member(1, "Ana Planned", {
          ...PLAN,
          status: "upcoming",
          moved_from: null,
          moved_reason: null,
        }),
      ],
    });
    renderTab();
    fireEvent.click(await screen.findByText("Ana Planned"));
    expect(await screen.findByRole("button", { name: /log 1-on-1/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skip" })).not.toBeInTheDocument();
  });
});
