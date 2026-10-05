import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MyRecordsPage } from "./MyRecordsPage";
import { getMyRecords } from "../services/myRecordsService";
import type { MyRecords } from "../types/myRecords";

vi.mock("../services/myRecordsService", () => ({ getMyRecords: vi.fn() }));
const get = vi.mocked(getMyRecords);

const FULL: MyRecords = {
  one_on_ones: [
    { id: 1, occurred_on: "2026-01-10", with_name: "Tina", summary: "Older chat" },
    { id: 2, occurred_on: "2026-03-10", with_name: "Tina", summary: "Newer chat" },
  ],
  pips: [
    {
      id: 1,
      status: "active",
      start_date: "2026-02-01",
      closed_on: null,
      shared_notes: "Weekly sync",
    },
  ],
  epr_cycles: [
    {
      id: 2,
      year: 2026,
      goal_setting_completed_at: "2026-01-15",
      mid_year_completed_at: null,
      final_review_completed_at: null,
      goals: [{ id: 1, description: "Improve testing" }],
      stage_summaries: [{ stage: "goal_setting", summary: "Goals agreed: testing + delivery." }],
    },
    {
      id: 1,
      year: 2025,
      goal_setting_completed_at: null,
      mid_year_completed_at: null,
      final_review_completed_at: null,
      goals: [],
      stage_summaries: [],
    },
  ],
};

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MyRecordsPage />
    </QueryClientProvider>
  );

describe("MyRecordsPage", () => {
  beforeEach(() => get.mockReset());

  it("renders review, plan and 1-on-1s with EPR step states", async () => {
    get.mockResolvedValue(FULL);
    renderPage();
    expect(await screen.findByText("Improve testing")).toBeInTheDocument();
    const steps = within(screen.getByRole("list", { name: "2026 review progress" })).getAllByRole(
      "listitem"
    );
    expect(steps[0]).toHaveTextContent("Completed 15/01/2026");
    expect(steps[1]).toHaveAttribute("aria-current", "step");
    expect(steps[1]).toHaveTextContent("In progress");
    expect(steps[2]).toHaveTextContent("Not started");
    expect(steps[2]).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Goals agreed: testing + delivery.")).toBeInTheDocument();
    expect(screen.getByText("2025 review")).toBeInTheDocument();
    expect(screen.getByText("In progress since 01/02/2026")).toBeInTheDocument();
    expect(screen.getByText("Weekly sync")).toBeInTheDocument();
    const summaries = screen.getAllByText(/chat$/).map((n) => n.textContent);
    expect(summaries).toEqual(["Newer chat", "Older chat"]);
  });

  it("omits the improvement plan when there are no PIPs", async () => {
    get.mockResolvedValue({ ...FULL, pips: [] });
    renderPage();
    await screen.findByText("Improve testing");
    expect(screen.queryByText("Improvement plan")).not.toBeInTheDocument();
  });

  it("shows closed/completed wording and per-section empty state", async () => {
    get.mockResolvedValue({
      one_on_ones: [],
      epr_cycles: [],
      pips: [
        {
          id: 1,
          status: "completed",
          start_date: "2026-01-01",
          closed_on: "2026-03-01",
          shared_notes: "",
        },
        {
          id: 2,
          status: "cancelled",
          start_date: "2026-01-01",
          closed_on: "2026-02-01",
          shared_notes: "",
        },
      ],
    });
    renderPage();
    expect(await screen.findByText("Completed 01/03/2026")).toBeInTheDocument();
    expect(screen.getByText("Closed 01/02/2026")).toBeInTheDocument();
    expect(
      screen.getByText("Summaries your team leader shares will appear here.")
    ).toBeInTheDocument();
  });

  it("shows a single empty state when everything is empty", async () => {
    get.mockResolvedValue({ one_on_ones: [], pips: [], epr_cycles: [] });
    renderPage();
    expect(await screen.findByText("Nothing shared yet")).toBeInTheDocument();
    expect(screen.queryByText("Review")).not.toBeInTheDocument();
  });

  it("shows a loading state, then an error with retry", async () => {
    get.mockRejectedValueOnce(new Error("boom"));
    renderPage();
    expect(screen.getByText("Loading your records...")).toBeInTheDocument();
    expect(await screen.findByText("Could not load your records")).toBeInTheDocument();
    get.mockResolvedValue(FULL);
    fireEvent.click(screen.getByRole("button", { name: /retry|try again/i }));
    expect(await screen.findByText("Improve testing")).toBeInTheDocument();
  });
});
