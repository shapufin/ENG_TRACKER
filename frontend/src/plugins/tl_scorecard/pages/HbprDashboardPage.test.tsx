import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { HbprDashboardPage } from "./HbprDashboardPage";
import { tlScorecardService } from "../services/tlScorecardService";
import type { HbprOverview, HbprPeoplePage } from "../types/tlScorecard";

vi.mock("../services/tlScorecardService", () => ({
  tlScorecardService: { getHbprOverview: vi.fn(), getHbprPeople: vi.fn() },
}));

const overview = vi.mocked(tlScorecardService.getHbprOverview);
const people = vi.mocked(tlScorecardService.getHbprPeople);

const OVERVIEW: HbprOverview = {
  needs_attention: {
    pips_awaiting_approval: 2,
    oldest_pip_days: 9,
    promotions_to_decide: 1,
    absences_overdue: 3,
    tls_behind_on_one_on_ones: 1,
  },
  tls: [
    {
      id: 7, name: "Tina Leader", team_size: 5, pending_pips: 1, active_pips: 2,
      open_idle_flags: 4, open_absences: 0, people_without_recent_one_on_one: 3,
    },
  ],
  one_on_one_stale_days: 45,
  absence_overdue_days: 5,
};

const ALL_CLEAR: HbprOverview = {
  ...OVERVIEW,
  needs_attention: {
    pips_awaiting_approval: 0, oldest_pip_days: null, promotions_to_decide: 0,
    absences_overdue: 0, tls_behind_on_one_on_ones: 0,
  },
};

const PEOPLE: HbprPeoplePage = {
  count: 60,
  results: [
    { id: 1, name: "Anna Rossi", italian_tl: { id: 7, name: "Tina Leader" }, albanian_tl: null, open_pip: "draft", last_one_on_one: "2026-09-15" },
    { id: 2, name: "Bruno Neri", italian_tl: null, albanian_tl: { id: 8, name: "Alb TL" }, open_pip: "active", last_one_on_one: null },
  ],
};

const ok = <T,>(data: T) => ({ data }) as never;

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <HbprDashboardPage />
      </MemoryRouter>
    </QueryClientProvider>
  );

describe("HbprDashboardPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    overview.mockResolvedValue(ok(OVERVIEW));
    people.mockResolvedValue(ok(PEOPLE));
  });

  it("renders needs-attention cards with specific links", async () => {
    renderPage();
    expect(await screen.findByText("Improvement plans awaiting approval")).toBeInTheDocument();
    expect(screen.getByText("Oldest has waited 9 days")).toBeInTheDocument();
    expect(screen.getByText("Absences unaddressed for 5+ days")).toBeInTheDocument();
    expect(screen.getByText(/behind on 1-on-1s \(45\+ days\)/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review 2 plans" })).toHaveAttribute("href", "/tl-scorecard?tab=records&kind=pips");
    expect(screen.getByRole("link", { name: "Review 1 nomination" })).toHaveAttribute("href", "/tl-scorecard?tab=records&kind=promotions");
    expect(screen.getByRole("link", { name: "Review 3 absences" })).toHaveAttribute("href", "/tl-scorecard?tab=records&kind=absences");
    expect(screen.getByRole("link", { name: "Review 1 team leader" })).toHaveAttribute("href", "/tl-scorecard?tab=records&kind=meetings");
  });

  it("hides zero-count cards and shows a calm message when all are zero", async () => {
    overview.mockResolvedValue(ok({ ...OVERVIEW, needs_attention: { ...ALL_CLEAR.needs_attention, absences_overdue: 3 } }));
    const { unmount } = renderPage();
    await screen.findByText("Absences unaddressed for 5+ days");
    expect(screen.queryByText("Promotions to decide")).not.toBeInTheDocument();
    unmount();

    overview.mockResolvedValue(ok(ALL_CLEAR));
    renderPage();
    expect(await screen.findByText("Nothing needs your attention")).toBeInTheDocument();
  });

  it("renders the team leader table with an Open records link", async () => {
    renderPage();
    expect(await screen.findByText("1 awaiting · 2 active")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open records for Tina Leader" })).toHaveAttribute(
      "href",
      "/tl-scorecard?tab=records&tl=7"
    );
  });

  it("renders people with placeholders and plan badges", async () => {
    renderPage();
    expect(await screen.findByText("Anna Rossi")).toBeInTheDocument();
    expect(screen.getByText("Awaiting approval")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("15/09/2026")).toBeInTheDocument();
    expect(screen.getByText("No 1-on-1 yet")).toBeInTheDocument();
    expect(screen.getByText("Showing 1–2 of 60")).toBeInTheDocument();
  });

  it("pages server-side", async () => {
    renderPage();
    await screen.findByText("Anna Rossi");
    expect(screen.getByRole("button", { name: /Previous/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    await waitFor(() => expect(people).toHaveBeenLastCalledWith({ q: "", limit: 25, offset: 25 }));
  });

  it("debounces search, resets paging and shows a no-match message", async () => {
    renderPage();
    await screen.findByText("Anna Rossi");
    people.mockResolvedValue(ok({ count: 0, results: [] }));
    fireEvent.change(screen.getByLabelText("Search people"), { target: { value: "zzz" } });
    expect(await screen.findByText("No one matches 'zzz'")).toBeInTheDocument();
    expect(people).toHaveBeenLastCalledWith({ q: "zzz", limit: 25, offset: 0 });
  });

  it("shows an empty message when the scope has no people", async () => {
    people.mockResolvedValue(ok({ count: 0, results: [] }));
    renderPage();
    expect(await screen.findByText("No people in your scope yet")).toBeInTheDocument();
  });

  it("shows a per-region error with retry", async () => {
    people.mockRejectedValueOnce(new Error("boom"));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Retry/ }));
    expect(await screen.findByText("Anna Rossi")).toBeInTheDocument();
  });

  it("shows no-access for a 403 instead of an empty list", async () => {
    people.mockRejectedValue({ response: { status: 403 } });
    renderPage();
    expect(await screen.findByText("You do not have access to this")).toBeInTheDocument();
    expect(screen.queryByText("No people in your scope yet")).not.toBeInTheDocument();
  });
});
