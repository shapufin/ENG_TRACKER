import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { HbprWorkspacePage } from "./HbprWorkspacePage";
import { tlScorecardService } from "../services/tlScorecardService";
import type {
  Absence,
  HbprEvidence,
  HbprOverview,
  PromotionFlag,
  ReviewDelivery,
} from "../types/tlScorecard";

vi.mock("../services/tlScorecardService", () => ({
  tlScorecardService: {
    getHbprOverview: vi.fn(),
    listHbprEvidencePage: vi.fn(),
    getHbprRecordsPage: vi.fn(),
  },
}));

// The export button hits the workbook endpoint; assert the leader it is given.
vi.mock("../components/ExportButton", () => ({
  ExportButton: ({ leaderId }: { leaderId?: number }) => (
    <span>Export evidence for {leaderId ?? "none"}</span>
  ),
}));

const svc = vi.mocked(tlScorecardService);
const YEAR = new Date().getFullYear();

const LEADER_A = {
  id: 7,
  name: "Alb TL",
  assignment_id: 11,
  cadence: "weekly" as const,
  team_size: 4,
  last_meeting_on: `${YEAR}-03-01`,
  next_due_on: `${YEAR}-03-08`,
  cadence_status: "on_track" as const,
  epr_mid_year: false,
  epr_year_end: false,
  evidence_count: 2,
  last_evidence_on: `${YEAR}-03-01`,
};
const LEADER_B = {
  id: 8,
  name: "Second TL",
  assignment_id: 12,
  cadence: "monthly" as const,
  team_size: 2,
  last_meeting_on: null,
  next_due_on: `${YEAR}-01-31`,
  cadence_status: "overdue" as const,
  epr_mid_year: true,
  epr_year_end: true,
  evidence_count: 1,
  last_evidence_on: `${YEAR}-01-05`,
};

const OVERVIEW: HbprOverview = {
  reporting_year: YEAR,
  recent_evidence_days: 7,
  needs_attention: {
    cadence_overdue: 1,
    cadence_due: 0,
    missing_mid_year_evidence: 1,
    missing_year_end_evidence: 1,
    recent_evidence: 1,
  },
  leaders: [LEADER_A, LEADER_B],
};

const EVIDENCE: HbprEvidence[] = [
  {
    id: 1,
    assignment: 11,
    albanian_tl: 7,
    hbpr: 5,
    cadence: "weekly",
    kind: "cadence_meeting",
    kind_display: "Cadence meeting",
    occurred_on: `${YEAR}-03-01`,
    reporting_year: null,
    shared_summary: "Weekly governance sync.",
    action_items: "Follow up on attrition.",
    reference_url: "",
    recorded_by: 7,
    recorded_by_name: "Alb TL",
    updated_by: null,
    updated_by_name: null,
    next_due_on: null,
    cadence_status: "on_track",
    created_at: `${YEAR}-03-01T10:00:00Z`,
    updated_at: `${YEAR}-03-01T10:00:00Z`,
  },
  {
    id: 2,
    assignment: 12,
    albanian_tl: 8,
    hbpr: 5,
    cadence: "monthly",
    kind: "epr_mid_year",
    kind_display: "EPR mid-year participation",
    occurred_on: `${YEAR}-06-15`,
    reporting_year: YEAR,
    shared_summary: "Mid-year participation.",
    action_items: "",
    reference_url: "",
    recorded_by: 8,
    recorded_by_name: "Second TL",
    updated_by: null,
    updated_by_name: null,
    next_due_on: null,
    cadence_status: "on_track",
    created_at: `${YEAR}-06-15T10:00:00Z`,
    updated_at: `${YEAR}-06-15T10:00:00Z`,
  },
  {
    id: 3,
    assignment: 11,
    albanian_tl: 7,
    hbpr: 5,
    cadence: "weekly",
    kind: "cadence_meeting",
    kind_display: "Cadence meeting",
    occurred_on: `${YEAR - 1}-03-01`,
    reporting_year: null,
    shared_summary: "Last year's sync.",
    action_items: "",
    reference_url: "",
    recorded_by: 7,
    recorded_by_name: "Alb TL",
    updated_by: null,
    updated_by_name: null,
    next_due_on: null,
    cadence_status: "on_track",
    created_at: `${YEAR - 1}-03-01T10:00:00Z`,
    updated_at: `${YEAR - 1}-03-01T10:00:00Z`,
  },
];

const ABSENCE: Absence = {
  id: 21,
  employee: 2,
  employee_name: "Anna Rossi",
  flagged_by: 7,
  flagged_by_name: "Alb TL",
  absence_date: `${YEAR}-03-04`,
  reason: "Unjustified",
  addressed_on: null,
  notes: "",
};
const PROMOTION: PromotionFlag = {
  id: 22,
  employee: 3,
  employee_name: "Bruno Neri",
  nominated_by: 8,
  nominated_by_name: "Second TL",
  nominated_on: `${YEAR}-02-01`,
  status: "nominated",
  decided_on: null,
  decided_by: null,
  decision_note: "",
  notes: "",
};
const REVIEW: ReviewDelivery = {
  id: 23,
  leader: 7,
  leader_name: "Alb TL",
  period: `${YEAR}-03`,
  recipient: "Ops",
  delivered_on: `${YEAR}-03-20`,
  notes: "private review note",
};

const ok = <T,>(data: T) => ({ data }) as never;

const renderPage = (entry = "/hbpr") =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[entry]}>
        <HbprWorkspacePage />
      </MemoryRouter>
    </QueryClientProvider>
  );

// Radix tabs activate on mouseDown, not click.
const selectView = (name: string) => fireEvent.mouseDown(screen.getByRole("tab", { name }));

describe("HbprWorkspacePage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    svc.getHbprOverview.mockResolvedValue(ok(OVERVIEW));
    // The API filters by reporting year and leader, so the mock does too.
    svc.listHbprEvidencePage.mockImplementation(async (params) => {
      const rows = EVIDENCE.slice(0, 2).filter(
        (e) => params.leader === undefined || e.albanian_tl === params.leader
      );
      return ok({ count: rows.length, results: rows });
    });
    svc.getHbprRecordsPage.mockImplementation(async ({ kind, status }) => {
      const byKind: Record<string, unknown[]> = {
        absences: [ABSENCE],
        promotions: [PROMOTION],
        reviews: [REVIEW],
      };
      const results = status ? [] : (byKind[kind] ?? []);
      return ok({ count: results.length, results });
    });
  });

  it("shows the attention summary and the assigned leaders roster on the overview", async () => {
    renderPage();
    expect(await screen.findByText("Cadence meetings overdue")).toBeInTheDocument();
    expect(screen.getByText("Mid-year EPR evidence missing")).toBeInTheDocument();
    // The roster renders a mobile card list and a desktop table, so names repeat.
    expect(screen.getAllByText("Alb TL").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Second TL").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Overdue").length).toBeGreaterThan(0);
  });

  it("does not surface one-on-one or approval-decision alerts", async () => {
    renderPage();
    await screen.findByText("Cadence meetings overdue");
    expect(screen.queryByText(/1-on-1/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/awaiting approval/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/promotions to decide/i)).not.toBeInTheDocument();
  });

  it("shows an onboarding empty state when no team leaders are assigned", async () => {
    svc.getHbprOverview.mockResolvedValue(
      ok({
        ...OVERVIEW,
        leaders: [],
        needs_attention: { ...OVERVIEW.needs_attention, cadence_overdue: 0 },
      })
    );
    renderPage();
    expect(await screen.findByText("No Albanian team leaders assigned yet")).toBeInTheDocument();
    expect(screen.queryByText("Needs your attention")).not.toBeInTheDocument();
  });

  it("shows no-access for a 403 instead of an empty workspace", async () => {
    svc.getHbprOverview.mockRejectedValue({ response: { status: 403 } });
    renderPage();
    expect(await screen.findByText("You do not have access to this")).toBeInTheDocument();
  });

  it("shows a retryable error for any other failure", async () => {
    svc.getHbprOverview.mockRejectedValueOnce(new Error("boom"));
    renderPage();
    expect(await screen.findByText("Could not load the workspace")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("restores the active view from the URL and switches views via the tabs", async () => {
    renderPage(`/hbpr?view=evidence&year=${YEAR}`);
    expect(await screen.findByText(`Governance evidence · ${YEAR}`)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Evidence" })).toHaveAttribute("aria-selected", "true");

    selectView("Records");
    expect(await screen.findByText("Governance records")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Records" })).toHaveAttribute("aria-selected", "true");
  });

  it("asks the API for the notification deep-link kind and shows its rows", async () => {
    renderPage("/hbpr?view=records&kind=absences");
    expect((await screen.findAllByText("Anna Rossi")).length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Bruno Neri")).toHaveLength(0);
    expect(svc.getHbprRecordsPage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "absences", limit: 25, offset: 0 })
    );
  });

  it("applies the promotion deep-link kind used by the notification links", async () => {
    renderPage("/hbpr?view=records&kind=promotions");
    expect((await screen.findAllByText("Bruno Neri")).length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Anna Rossi")).toHaveLength(0);
  });

  it("defaults to the first record type when no kind is given", async () => {
    renderPage("/hbpr?view=records");
    await screen.findByText("Governance records");
    expect(svc.getHbprRecordsPage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "meetings" })
    );
  });

  it("reports no matches for a filter combination that returns nothing", async () => {
    renderPage("/hbpr?view=records&kind=absences&status=addressed");
    expect((await screen.findAllByText("No records match these filters")).length).toBeGreaterThan(
      0
    );
  });

  it("sends status, period and leader to the API instead of filtering in the browser", async () => {
    renderPage("/hbpr?view=records&kind=pips&status=draft&period=2026-03&leader=8");
    await screen.findByText("Governance records");
    expect(svc.getHbprRecordsPage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "pips",
        status: "draft",
        period: "2026-03",
        leader: 8,
      })
    );
  });

  it("pages records on the server and restores the page from the URL", async () => {
    svc.getHbprRecordsPage.mockImplementation(async () => ok({ count: 60, results: [ABSENCE] }));
    renderPage("/hbpr?view=records&kind=absences");
    expect((await screen.findAllByText("Showing 1–25 of 60 records")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: "Next page" })[0]);
    await screen.findAllByText("Showing 26–50 of 60 records");
    expect(svc.getHbprRecordsPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 25 })
    );
  });

  it("restores a deep-linked page", async () => {
    svc.getHbprRecordsPage.mockImplementation(async () => ok({ count: 60, results: [ABSENCE] }));
    renderPage("/hbpr?view=records&kind=absences&page=3");
    expect((await screen.findAllByText("Showing 51–60 of 60 records")).length).toBeGreaterThan(0);
    expect(svc.getHbprRecordsPage).toHaveBeenCalledWith(expect.objectContaining({ offset: 50 }));
  });

  it("scopes the evidence timeline to the reporting year on the server", async () => {
    renderPage(`/hbpr?view=evidence&year=${YEAR}`);
    expect(await screen.findByText("Weekly governance sync.")).toBeInTheDocument();
    expect(screen.getByText("Mid-year participation.")).toBeInTheDocument();
    expect(svc.listHbprEvidencePage).toHaveBeenCalledWith(
      expect.objectContaining({ period_year: YEAR, page: 1 })
    );
  });

  it("asks the API for the selected leader's evidence", async () => {
    renderPage(`/hbpr?view=evidence&year=${YEAR}&leader=8`);
    expect(await screen.findByText("Mid-year participation.")).toBeInTheDocument();
    expect(screen.queryByText("Weekly governance sync.")).not.toBeInTheDocument();
    expect(svc.listHbprEvidencePage).toHaveBeenCalledWith(expect.objectContaining({ leader: 8 }));
  });

  it("exports evidence for the selected leader", async () => {
    renderPage(`/hbpr?view=evidence&leader=8`);
    expect((await screen.findAllByText("Export evidence for 8")).length).toBeGreaterThan(0);
  });

  it("defaults the export to the first assigned leader", async () => {
    renderPage();
    expect(await screen.findByText("Export evidence for 7")).toBeInTheDocument();
  });

  it("ignores an out-of-scope leader deep link and falls back to the first leader", async () => {
    renderPage("/hbpr?view=evidence&leader=999");
    expect(await screen.findByText("Weekly governance sync.")).toBeInTheDocument();
    expect(screen.getByText("Mid-year participation.")).toBeInTheDocument();
    expect(screen.getAllByText("Export evidence for 7").length).toBeGreaterThan(0);
    expect(svc.listHbprEvidencePage).not.toHaveBeenCalledWith(
      expect.objectContaining({ leader: 999 })
    );
  });

  it("falls back to the current year for an out-of-range year", async () => {
    renderPage("/hbpr?view=evidence&year=1999");
    expect(await screen.findByText(`Governance evidence · ${YEAR}`)).toBeInTheDocument();
  });

  it("never renders a review delivery's private notes", async () => {
    renderPage("/hbpr?view=records&kind=reviews");
    expect((await screen.findAllByText("Ops")).length).toBeGreaterThan(0);
    // The period is the visible substance; the TL's private note must not appear.
    expect(screen.getAllByText(`${YEAR}-03`).length).toBeGreaterThan(0);
    expect(screen.queryByText("private review note")).not.toBeInTheDocument();
  });

  it("renders record states as tone badges with icon and text, never color alone", async () => {
    renderPage("/hbpr?view=records&kind=absences");
    const badges = await screen.findAllByText(/working days open/i);
    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges) {
      expect(badge.closest('[role="status"]')).not.toBeNull();
    }
  });

  it("switches record kinds from the sidebar and drops the old status filter", async () => {
    renderPage("/hbpr?view=records&kind=absences&status=addressed");
    const nav = await screen.findByRole("navigation", { name: "Record types" });
    fireEvent.click(within(nav).getByRole("button", { name: /promotions/i }));
    await waitFor(() =>
      expect(svc.getHbprRecordsPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: "promotions" })
      )
    );
    const last = svc.getHbprRecordsPage.mock.calls.at(-1)?.[0] as unknown as Record<
      string,
      unknown
    >;
    expect(last).not.toHaveProperty("status");
  });

  it("marks the active kind pressed and shows its server total", async () => {
    renderPage("/hbpr?view=records&kind=absences");
    // Wait for the server total before asserting the count beside the kind.
    expect((await screen.findAllByText("Anna Rossi")).length).toBeGreaterThan(0);
    const nav = await screen.findByRole("navigation", { name: "Record types" });
    expect(within(nav).getByRole("button", { name: /absences 1/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(within(nav).getByRole("button", { name: /promotions/i })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });
});
