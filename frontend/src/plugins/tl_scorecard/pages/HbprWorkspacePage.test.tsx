import { fireEvent, render, screen } from "@testing-library/react";
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
    listHbprEvidence: vi.fn(),
    listMeetings: vi.fn(),
    listIdleFlags: vi.fn(),
    listAbsences: vi.fn(),
    listReviewDeliveries: vi.fn(),
    listPIPRecords: vi.fn(),
    listPromotionFlags: vi.fn(),
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
    svc.listHbprEvidence.mockResolvedValue(EVIDENCE);
    svc.listMeetings.mockResolvedValue([]);
    svc.listIdleFlags.mockResolvedValue([]);
    svc.listAbsences.mockResolvedValue([ABSENCE]);
    svc.listReviewDeliveries.mockResolvedValue([REVIEW]);
    svc.listPIPRecords.mockResolvedValue([]);
    svc.listPromotionFlags.mockResolvedValue([PROMOTION]);
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

  it("filters records by the notification deep-link kind", async () => {
    renderPage("/hbpr?view=records&kind=absences");
    expect((await screen.findAllByText("Anna Rossi")).length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Bruno Neri")).toHaveLength(0);
  });

  it("applies the promotion deep-link kind used by the notification links", async () => {
    renderPage("/hbpr?view=records&kind=promotions");
    expect((await screen.findAllByText("Bruno Neri")).length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Anna Rossi")).toHaveLength(0);
  });

  it("reports no matches for an impossible filter combination", async () => {
    renderPage("/hbpr?view=records&kind=absences&status=promoted");
    expect((await screen.findAllByText("No records match these filters")).length).toBeGreaterThan(
      0
    );
  });

  it("scopes the evidence timeline to the reporting year", async () => {
    renderPage(`/hbpr?view=evidence&year=${YEAR}`);
    expect(await screen.findByText("Weekly governance sync.")).toBeInTheDocument();
    expect(screen.getByText("Mid-year participation.")).toBeInTheDocument();
    expect(screen.queryByText("Last year's sync.")).not.toBeInTheDocument();
  });

  it("filters the evidence timeline to the selected leader", async () => {
    renderPage(`/hbpr?view=evidence&year=${YEAR}&leader=8`);
    // Wait for the timeline to load, then assert the other leader is excluded.
    expect(await screen.findByText("Mid-year participation.")).toBeInTheDocument();
    expect(screen.queryByText("Weekly governance sync.")).not.toBeInTheDocument();
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
});
