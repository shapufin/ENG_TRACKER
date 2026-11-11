import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { HbprPartnershipSection } from "./HbprPartnershipSection";
import type { HbprEvidence, HbprPartnership, YearEndEvidencePack } from "../../types/tlScorecard";

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

const PARTNERSHIP: HbprPartnership = {
  reporting_year: 2026,
  assignment: {
    id: 11,
    hbpr: { id: 5, name: "Elda Partner" },
    cadence: "weekly",
    cadence_missing: false,
    cadence_day_of_week: null,
    cadence_nth_week: null,
    can_edit_cadence: true,
    effective_from: "2026-01-01",
    last_meeting_on: "2026-03-01",
    next_due_on: "2026-03-08",
    cadence_status: "on_track",
    epr_mid_year: false,
    epr_year_end: false,
    evidence_count: 1,
    last_evidence_on: "2026-03-01",
  },
};

const EVIDENCE: HbprEvidence = {
  id: 3,
  assignment: 11,
  albanian_tl: 7,
  hbpr: 5,
  cadence: "weekly",
  kind: "cadence_meeting",
  kind_display: "Cadence meeting",
  status: "held",
  cancel_reason: "",
  occurred_on: "2026-03-01",
  reporting_year: null,
  shared_summary: "Weekly governance sync.",
  action_items: "Follow up on attrition.",
  reference_url: "",
  recorded_by: 7,
  recorded_by_name: "Enri Leader",
  updated_by: null,
  updated_by_name: null,
  next_due_on: null,
  cadence_status: "on_track",
  created_at: "2026-03-01T10:00:00Z",
  updated_at: "2026-03-01T10:00:00Z",
};

const PACK: YearEndEvidencePack = {
  assignment: {
    id: 11,
    albanian_tl_name: "Enri Leader",
    hbpr_name: "Elda Partner",
    cadence: "weekly",
    effective_from: "2026-01-01",
    effective_to: null,
  },
  year: 2026,
  cadence_expected: 40,
  cadence_held: 31,
  coverage_pct: 77.5,
  meetings: [],
  epr_mid_year: null,
  epr_year_end: null,
  employee_epr: [],
};

const renderSection = (
  overrides: Partial<React.ComponentProps<typeof HbprPartnershipSection>> = {}
) => {
  const onCreate = vi.fn().mockResolvedValue(undefined);
  const onUpdate = vi.fn().mockResolvedValue(undefined);
  const onUpdateCadence = vi.fn().mockResolvedValue(undefined);
  const onRetry = vi.fn();
  const loadEvidencePack = vi.fn().mockResolvedValue(PACK);
  render(
    <HbprPartnershipSection
      partnership={PARTNERSHIP}
      evidence={[]}
      year={2026}
      isLoading={false}
      isError={false}
      onRetry={onRetry}
      canAuthor
      onCreate={onCreate}
      onUpdate={onUpdate}
      onUpdateCadence={onUpdateCadence}
      loadEvidencePack={loadEvidencePack}
      {...overrides}
    />
  );
  return { onCreate, onUpdate, onUpdateCadence, onRetry, loadEvidencePack };
};

describe("HbprPartnershipSection", () => {
  beforeEach(() => vi.resetAllMocks());

  it("shows who the HBPR is, the cadence state and the EPR gaps", () => {
    renderSection();
    expect(screen.getByText("Elda Partner")).toBeInTheDocument();
    expect(screen.getByText("On track")).toBeInTheDocument();
    expect(screen.getByText("Mid-year EPR: not logged")).toBeInTheDocument();
    expect(screen.getByText("Year-end EPR: not logged")).toBeInTheDocument();
  });

  const MISSING: HbprPartnership = {
    ...PARTNERSHIP,
    assignment: {
      ...PARTNERSHIP.assignment!,
      cadence: null,
      cadence_display: "Not set",
      cadence_missing: true,
      next_due_on: null,
      last_meeting_on: null,
      cadence_status: "cadence_not_set",
    },
  };

  it("asks the Line Manager to set a missing cadence and requires a choice", async () => {
    const { onUpdateCadence } = renderSection({ partnership: MISSING });
    expect(screen.getByText("Set your HBPR meeting cadence")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Set cadence" }));
    const save = await screen.findByRole("button", { name: /save schedule/i });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole("option", { name: "Weekly" }));
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() =>
      expect(onUpdateCadence).toHaveBeenCalledWith({
        cadence: "weekly",
        cadence_day_of_week: null,
        cadence_nth_week: null,
      })
    );
  });

  it("hides the banner once the cadence is set", () => {
    renderSection();
    expect(screen.queryByText("Set your HBPR meeting cadence")).toBeNull();
  });

  it("hides the banner from a viewer who cannot edit the cadence", () => {
    renderSection({
      partnership: {
        ...MISSING,
        assignment: { ...MISSING.assignment!, can_edit_cadence: false },
      },
    });
    expect(screen.queryByText("Set your HBPR meeting cadence")).toBeNull();
    expect(screen.getByText(/Cadence not set/)).toBeInTheDocument();
  });

  it("changes the meeting schedule", async () => {
    const { onUpdateCadence } = renderSection();
    fireEvent.click(screen.getByRole("button", { name: /change schedule/i }));
    fireEvent.click(await screen.findByRole("option", { name: "Monthly" }));
    fireEvent.click(screen.getByRole("button", { name: /save schedule/i }));
    await waitFor(() =>
      expect(onUpdateCadence).toHaveBeenCalledWith({
        cadence: "monthly",
        cadence_day_of_week: null,
        cadence_nth_week: null,
      })
    );
  });

  it("sends the monthly weekday pattern", async () => {
    const { onUpdateCadence } = renderSection();
    fireEvent.click(screen.getByRole("button", { name: /change schedule/i }));
    fireEvent.click(await screen.findByRole("option", { name: "Monthly" }));
    // Defaults to 2nd + Thursday when no weekday pattern is stored yet.
    fireEvent.click(screen.getByRole("button", { name: "Specific weekday" }));
    expect(screen.getByRole("button", { name: "Specific weekday" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    fireEvent.click(screen.getByRole("button", { name: /save schedule/i }));
    await waitFor(() =>
      expect(onUpdateCadence).toHaveBeenCalledWith({
        cadence: "monthly",
        cadence_day_of_week: 3,
        cadence_nth_week: 2,
      })
    );
  });

  it("drops a stale weekday when switching to a day-of-month schedule", async () => {
    const base = PARTNERSHIP.assignment!;
    const { onUpdateCadence } = renderSection({
      partnership: { ...PARTNERSHIP, assignment: { ...base, cadence_day_of_week: 1 } },
    });
    fireEvent.click(screen.getByRole("button", { name: /change schedule/i }));
    fireEvent.click(await screen.findByRole("option", { name: "Monthly" }));
    fireEvent.click(screen.getByRole("button", { name: /save schedule/i }));
    await waitFor(() =>
      expect(onUpdateCadence).toHaveBeenCalledWith({
        cadence: "monthly",
        cadence_day_of_week: null,
        cadence_nth_week: null,
      })
    );
  });

  it("hides the schedule control when the server says no", () => {
    const base = PARTNERSHIP.assignment!;
    renderSection({
      partnership: { ...PARTNERSHIP, assignment: { ...base, can_edit_cadence: false } },
    });
    expect(screen.queryByRole("button", { name: /change schedule/i })).not.toBeInTheDocument();
  });

  it("tells an unpaired team leader there is no HBPR yet", () => {
    renderSection({ partnership: { reporting_year: 2026, assignment: null } });
    expect(screen.getByText("No HR business partner assigned yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /log cadence meeting/i })).not.toBeInTheDocument();
  });

  it("is read-only for a viewer who cannot author", () => {
    renderSection({ canAuthor: false, evidence: [EVIDENCE] });
    expect(screen.queryByRole("button", { name: /log cadence meeting/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.getByText("Weekly governance sync.")).toBeInTheDocument();
  });

  it("shows a retryable error", () => {
    const { onRetry } = renderSection({ isError: true });
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("records a cadence meeting for the assignment", async () => {
    const { onCreate } = renderSection();
    fireEvent.click(screen.getByRole("button", { name: /log cadence meeting/i }));

    fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "Discussed Q2 goals" } });
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          assignment: 11,
          kind: "cadence_meeting",
          reporting_year: null,
          shared_summary: "Discussed Q2 goals",
        })
      )
    );
  });

  it("offers no manual EPR entry: those rows come from the employee EPR stage", () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: /log cadence meeting/i }));
    expect(screen.queryByLabelText(/entry type/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Reporting year/)).not.toBeInTheDocument();
  });

  it("edits an existing evidence row through the dialog", async () => {
    const { onUpdate } = renderSection({ evidence: [EVIDENCE] });
    fireEvent.click(screen.getByRole("button", { name: /edit cadence meeting/i }));

    const summary = await screen.findByLabelText("Summary");
    expect(summary).toHaveValue("Weekly governance sync.");
    fireEvent.change(summary, { target: { value: "Revised summary" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(
        3,
        expect.objectContaining({ assignment: 11, shared_summary: "Revised summary" })
      )
    );
  });

  it("opens the year-end evidence pack for the assignment", async () => {
    const { loadEvidencePack } = renderSection();
    fireEvent.click(screen.getByRole("button", { name: /year-end summary/i }));

    await waitFor(() => expect(loadEvidencePack).toHaveBeenCalledWith(11, 2026));
    expect(await screen.findByText("2026 year-end summary")).toBeInTheDocument();
    expect(screen.getByText("31/40")).toBeInTheDocument();
  });

  it("logs the due meeting as held with its date prefilled", async () => {
    const { onCreate } = renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Meeting held" }));
    expect(await screen.findByLabelText(/Meeting date/)).toHaveValue("2026-03-08");
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "cadence_meeting",
          status: "held",
          occurred_on: "2026-03-08",
        })
      )
    );
  });

  it("cancels the due meeting only with a reason", async () => {
    const { onCreate } = renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Cancel meeting" }));
    const submit = await screen.findByRole("button", { name: "Cancel meeting", hidden: false });
    const buttons = screen.getAllByRole("button", { name: "Cancel meeting" });
    const confirm = buttons[buttons.length - 1];
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: "HBPR on leave" } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "cancelled",
          cancel_reason: "HBPR on leave",
          occurred_on: "2026-03-08",
        })
      )
    );
    expect(submit).toBeTruthy();
  });

  it("says when the next date moved because of a public holiday", () => {
    renderSection({
      partnership: {
        ...PARTNERSHIP,
        assignment: {
          ...PARTNERSHIP.assignment!,
          next_due_on: "2026-03-15",
          next_due_moved_from: "2026-03-08",
        },
      },
    });
    expect(screen.getByText(/Moved from .*public holiday/)).toBeInTheDocument();
  });

  it("marks a cancelled slot with its reason", () => {
    renderSection({
      evidence: [{ ...EVIDENCE, status: "cancelled", cancel_reason: "HBPR on leave" }],
    });
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.getByText("HBPR on leave")).toBeInTheDocument();
  });
});
