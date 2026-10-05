import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import { TLScorecardPage } from "./TLScorecardPage";
import { tlScorecardService } from "../services/tlScorecardService";
import { downloadBlobResponse } from "@/lib/download";
import type { KpiCoverageEntry, Scorecard } from "../types/tlScorecard";

vi.mock("../services/tlScorecardService", () => ({
  tlScorecardService: {
    getScorecard: vi.fn(),
    getKpiCoverage: vi.fn(),
    getApprovalEngagementScore: vi.fn(),
    getEngagementSurveyTeamAverage: vi.fn(),
    getEscalations: vi.fn(),
    listPIPRecords: vi.fn(),
    listEPRCycles: vi.fn(),
    exportWorkbook: vi.fn(),
    getPartnership: vi.fn(),
    listHbprEvidence: vi.fn(),
    createHbprEvidence: vi.fn(),
    updateHbprEvidence: vi.fn(),
    listMeetings: vi.fn(),
    listIdleFlags: vi.fn(),
    listAbsences: vi.fn(),
    listReviewDeliveries: vi.fn(),
    listPromotionFlags: vi.fn(),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Radix Select is unreliable to drive via fireEvent in JSDOM: render it flat.
vi.mock("@/components/ui/select", () => {
  const Ctx = React.createContext<{ onValueChange?: (v: string) => void }>({});
  return {
    Select: ({
      children,
      onValueChange,
    }: {
      children: React.ReactNode;
      onValueChange?: (v: string) => void;
    }) => <Ctx.Provider value={{ onValueChange }}>{children}</Ctx.Provider>,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => {
      const ctx = React.useContext(Ctx);
      return (
        <button type="button" role="option" onClick={() => ctx.onValueChange?.(value)}>
          {children}
        </button>
      );
    },
    SelectTrigger: ({ id, children }: { id?: string; children: React.ReactNode }) => (
      <button type="button" role="combobox" id={id}>
        {children}
      </button>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  };
});

vi.mock("@/lib/download", () => ({
  downloadBlobResponse: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, username: "leader", teams: [] } }),
}));

const perms = vi.hoisted(() => ({ value: { isAdmin: false } as Record<string, boolean> }));
vi.mock("@/context/PermissionContext", () => ({
  usePermissions: () => perms.value,
}));

vi.mock("@/services/userService", () => ({
  userService: {
    getMyTeamMembers: vi.fn().mockResolvedValue([]),
  },
}));

const SCORECARD: Scorecard = {
  month: "2026-09-01",
  team_size: 4,
  leave: { decided_count: 3, pct_within_2_days: 66.7, pending_at_month_end: 1 },
  overtime: { decided_count: 2, avg_turnaround_days: 1.5 },
  meetings: {
    one_on_one_compliance_pct: 75,
    tl_sync_count: 3,
    team_meetings_held: 1,
    team_meetings_with_hrbp: 1,
    team_meeting_notes_within_24h: 1,
  },
  idle: { open_count: 1, resolved_count: 2 },
  review_deliveries_ytd: 5,
  seniority: { junior: 1, mid: 2, senior: 1, unset: 0 },
  absences: { open_count: 1, breached_5_day_sla: 0 },
  pip: { active_count: 1, pending_approval_count: 0 },
  promotion: { promoted_count: 0, team_size: 4, promoted_pct: 0, target_pct: 3 },
  escalation_count: 0,
};

const COVERAGE: KpiCoverageEntry[] = [
  {
    kpi: "Leave requests decided within 2 working days",
    sheet: 2,
    status: "measured",
    phase: 1,
    note: "n/a",
  },
  {
    kpi: "Regretted voluntary turnover < 7%",
    sheet: 1,
    status: "blocked",
    phase: 3,
    note: "needs HR taxonomy",
  },
];

const mockDefaults = () => {
  (tlScorecardService.getScorecard as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: SCORECARD,
  });
  (tlScorecardService.getKpiCoverage as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: COVERAGE,
  });
  (tlScorecardService.getEngagementSurveyTeamAverage as ReturnType<typeof vi.fn>).mockResolvedValue(
    {
      data: { period: "2026-09", average_score: null, response_count: 0 },
    }
  );
  (tlScorecardService.getApprovalEngagementScore as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { engagement_score: 82 },
  });
  (tlScorecardService.getEscalations as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
  (tlScorecardService.listPIPRecords as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (tlScorecardService.listEPRCycles as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (tlScorecardService.exportWorkbook as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: new Blob(["fake xlsx"]),
  });
  (tlScorecardService.getPartnership as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { reporting_year: 2026, assignment: null },
  });
  (tlScorecardService.listHbprEvidence as ReturnType<typeof vi.fn>).mockResolvedValue([]);
};

const renderPage = (entry = "/tl-scorecard") => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <TLScorecardPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe("TLScorecardPage", () => {
  it("renders leave SLA, pending count, and OT turnaround from the scorecard endpoint", async () => {
    mockDefaults();

    renderPage();

    await waitFor(() => expect(screen.getByText("66.7%")).toBeInTheDocument());
    expect(screen.getByText("1.5d")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("labels the approval-behavior engagement score as a proxy, not the sentiment KPI", async () => {
    mockDefaults();

    renderPage();

    await waitFor(() => expect(screen.getByText("8.2/10")).toBeInTheDocument());
    expect(screen.getByText(/No pulse-survey responses yet/i)).toBeInTheDocument();
  });

  it("shows the real pulse-survey average once responses exist", async () => {
    mockDefaults();
    (
      tlScorecardService.getEngagementSurveyTeamAverage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      data: { period: "2026-09", average_score: 8.7, response_count: 3 },
    });

    renderPage();

    await waitFor(() => expect(screen.getByText("8.7/10")).toBeInTheDocument());
    expect(screen.getByText(/3 response\(s\)/)).toBeInTheDocument();
  });

  it("renders meeting compliance, idle, and review-delivery metrics", async () => {
    mockDefaults();

    renderPage();

    await waitFor(() => expect(screen.getByText("75%")).toBeInTheDocument());
    expect(screen.getByText("3")).toBeInTheDocument(); // TL-Italy syncs
    expect(screen.getByText("1/1")).toBeInTheDocument(); // team meetings with HRBP
    expect(screen.getByText("5")).toBeInTheDocument(); // review deliveries YTD
  });

  it("renders governance metrics and an empty escalations state when nothing is breached", async () => {
    mockDefaults();

    renderPage();

    await waitFor(() => expect(screen.getByText("Nothing needs escalating")).toBeInTheDocument());
    expect(screen.getByText("Promotion ratio")).toBeInTheDocument();
  });

  it("renders escalation candidates when breaches exist", async () => {
    mockDefaults();
    (tlScorecardService.getEscalations as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        {
          kind: "leave_pending",
          subject_id: 5,
          subject_name: "Jane Doe",
          detail: "Leave request pending 5 business days.",
          since: "2026-09-01",
        },
      ],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText("Jane Doe")).toBeInTheDocument());
    expect(screen.getByText("Leave request pending 5 business days.")).toBeInTheDocument();
  });

  it("renders the KPI coverage panel with every entry's status", async () => {
    mockDefaults();

    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Leave requests decided within 2 working days")).toBeInTheDocument()
    );
    expect(screen.getByText("Regretted voluntary turnover < 7%")).toBeInTheDocument();
    expect(screen.getByText("Measured")).toBeInTheDocument();
    expect(screen.getByText("Blocked")).toBeInTheDocument();
  });

  it("shows an error card when the scorecard fetch fails", async () => {
    mockDefaults();
    (tlScorecardService.getScorecard as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("boom")
    );

    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Couldn't load your scorecard")).toBeInTheDocument()
    );
  });

  it("downloads the evidence workbook when Export Summary is clicked", async () => {
    mockDefaults();
    renderPage();

    const buttons = await screen.findAllByRole("button", { name: "Export Summary" });
    fireEvent.click(buttons[0]);

    await waitFor(() => expect(tlScorecardService.exportWorkbook).toHaveBeenCalledTimes(1));
    expect(downloadBlobResponse).toHaveBeenCalledTimes(1);
  });

  it("shows a visible message, not silence, when the export fails", async () => {
    mockDefaults();
    (tlScorecardService.exportWorkbook as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { status: 500 },
    });
    renderPage();

    fireEvent.click((await screen.findAllByRole("button", { name: "Export Summary" }))[0]);

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be exported/i);
    expect(downloadBlobResponse).not.toHaveBeenCalled();
  });

  it("offers Overview and Records tabs and keeps Overview as the default", async () => {
    mockDefaults();
    renderPage();

    await waitFor(() => expect(screen.getByText("66.7%")).toBeInTheDocument());
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Records" })).toBeInTheDocument();
  });

  it("opens the Records tab from the URL even when the scorecard cannot load", async () => {
    mockDefaults();
    (tlScorecardService.getScorecard as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("boom")
    );
    (tlScorecardService.listPIPRecords as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderPage("/tl-scorecard?tab=records&kind=pips");

    expect(await screen.findByText("No records yet")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Records" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /pips/i })).toHaveAttribute("aria-selected", "true");
  });

  it("shows the records description and current-quarter pill", async () => {
    mockDefaults();
    (tlScorecardService.listPIPRecords as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderPage("/tl-scorecard?tab=records&kind=pips");

    expect(await screen.findByText(/Historical activity log/i)).toBeInTheDocument();
    expect(screen.getByRole("status", { name: /Q[1-4] Active/i })).toBeInTheDocument();
  });

  it("shows the HBPR partnership with its cadence state", async () => {
    mockDefaults();
    perms.value = { isAdmin: false, isTeamLeader: true };
    (tlScorecardService.getPartnership as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        reporting_year: 2026,
        assignment: {
          id: 11,
          hbpr: { id: 5, name: "Elda Partner" },
          cadence: "weekly",
          effective_from: "2026-01-01",
          last_meeting_on: null,
          next_due_on: "2026-01-08",
          cadence_status: "not_started",
          epr_mid_year: false,
          epr_year_end: false,
          evidence_count: 0,
          last_evidence_on: null,
        },
      },
    });

    renderPage();

    expect(await screen.findByText("HBPR partnership")).toBeInTheDocument();
    expect(screen.getByText("Elda Partner")).toBeInTheDocument();
    expect(screen.getByText("Mid-year EPR: missing")).toBeInTheDocument();
    // The AL TL authors the evidence.
    expect(screen.getByRole("button", { name: /record evidence/i })).toBeInTheDocument();
    perms.value = { isAdmin: false };
  });

  it("tells an unpaired Albanian TL there is no HBPR yet", async () => {
    mockDefaults();
    renderPage();
    expect(await screen.findByText("No HR business partner assigned yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /record evidence/i })).not.toBeInTheDocument();
  });

  it("sends an HBPR-only user to their own workspace instead of this page", async () => {
    mockDefaults();
    perms.value = { isAdmin: false, isHBPROnly: true, isTeamLeader: false };

    renderPage();

    await waitFor(() => expect(screen.queryByText("TL Scorecard")).not.toBeInTheDocument());
    expect(tlScorecardService.getScorecard).not.toHaveBeenCalled();
    perms.value = { isAdmin: false };
  });

  it("opens the create dialog from the records toolbar", async () => {
    mockDefaults();
    (tlScorecardService.listIdleFlags as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderPage("/tl-scorecard?tab=records&kind=idle");

    fireEvent.click(await screen.findByRole("button", { name: "Flag idle" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
